import { AuditAction } from "@cms/shared";
import { prisma } from "@/lib/db/prisma";
import type { Form, FormCategory, FormQuestionType, FormStatus } from "@prisma/client";

export class FormError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "FormError";
  }
}

type Actor = { id: string; role: string };

export function requireStaff(actor: Actor): void {
  if (actor.role !== "MENTOR" && actor.role !== "ADMIN") {
    throw new FormError("Staff access required", "FORBIDDEN", 403);
  }
}

async function requireOwnedForm(actor: Actor, formId: string) {
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  if (form.createdById !== actor.id && actor.role !== "ADMIN") {
    throw new FormError("You do not have access to this form", "FORBIDDEN", 403);
  }
  return form;
}

export type SectionInput = {
  title?: string;
  description?: string;
  questions: QuestionInput[];
};

export type QuestionInput = {
  type: FormQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  config?: Record<string, unknown>;
  templateId?: string;
};

export async function createForm(
  actor: Actor,
  input: { title: string; category?: FormCategory; feedbackTargetType?: string; feedbackTargetLabel?: string }
): Promise<Form> {
  requireStaff(actor);
  if (!input.title.trim()) throw new FormError("Title is required", "VALIDATION_ERROR", 400);
  return prisma.form.create({
    data: {
      title: input.title.trim(),
      category: input.category ?? "GENERIC",
      feedbackTargetType: input.feedbackTargetType,
      feedbackTargetLabel: input.feedbackTargetLabel,
      createdById: actor.id,
    },
  });
}

export async function getFormWithStructure(formId: string) {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  return form;
}

export async function listForms(
  actor: Actor,
  filters: { status?: FormStatus; category?: FormCategory; search?: string }
) {
  requireStaff(actor);
  return prisma.form.findMany({
    where: {
      // Templates are shared with every staff member; other forms stay
      // private to their creator (admins see everything).
      ...(actor.role === "ADMIN" ? {} : { OR: [{ createdById: actor.id }, { isTemplate: true }] }),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: "insensitive" } }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sections: true, responses: true } } },
  });
}

export async function updateFormMeta(
  actor: Actor,
  formId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    headerImageUrl: string | null;
    themeColor: string | null;
    opensAt: Date | null;
    closesAt: Date | null;
    allowMultipleSubmissions: boolean;
    feedbackTargetType: string | null;
    feedbackTargetLabel: string | null;
    isTemplate: boolean;
    publicLinkEnabled: boolean;
  }>
): Promise<Form> {
  await requireOwnedForm(actor, formId);
  return prisma.form.update({ where: { id: formId }, data: patch });
}

const ALLOWED_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

export async function setFormStatus(actor: Actor, formId: string, next: FormStatus): Promise<Form> {
  const form = await requireOwnedForm(actor, formId);
  if (!ALLOWED_TRANSITIONS[form.status].includes(next)) {
    throw new FormError(`Cannot move a form from ${form.status} to ${next}`, "INVALID_TRANSITION", 409);
  }
  if (next === "PUBLISHED") {
    const sectionCount = await prisma.formSection.count({ where: { formId } });
    if (sectionCount === 0) {
      throw new FormError("Add at least one section before publishing", "EMPTY_FORM", 400);
    }
  }
  return prisma.form.update({ where: { id: formId }, data: { status: next } });
}

// Replaces the entire section/question tree. Only permitted while a form
// is DRAFT: once PUBLISHED, a form may have responses whose FormAnswer
// rows cascade-delete with their FormQuestion, so a destructive rebuild
// could silently erase collected answers. Editing a live form's structure
// is explicitly out of scope for this build — duplicate it instead.
export async function saveFormStructure(
  actor: Actor,
  formId: string,
  sections: SectionInput[]
): Promise<void> {
  const form = await requireOwnedForm(actor, formId);
  if (form.status !== "DRAFT") {
    throw new FormError("Only a draft form's structure can be edited", "NOT_DRAFT", 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.formSection.deleteMany({ where: { formId } });
    for (let sectionOrder = 0; sectionOrder < sections.length; sectionOrder += 1) {
      const section = sections[sectionOrder];
      await tx.formSection.create({
        data: {
          formId,
          title: section.title,
          description: section.description,
          order: sectionOrder,
          questions: {
            create: section.questions.map((question, questionOrder) => ({
              type: question.type,
              title: question.title,
              description: question.description,
              required: question.required ?? false,
              order: questionOrder,
              config: (question.config ?? {}) as object,
              templateId: question.templateId,
            })),
          },
        },
      });
    }
  });
}

// Also how a template is used: any staff member may copy a template, and the
// copy keeps the template's title. A copy is never itself a template and
// never inherits a public link — sharing is decided per copy.
export async function duplicateForm(actor: Actor, formId: string): Promise<Form> {
  requireStaff(actor);
  const source = await getFormWithStructure(formId);
  if (source.createdById !== actor.id && actor.role !== "ADMIN" && !source.isTemplate) {
    throw new FormError("You do not have access to this form", "FORBIDDEN", 403);
  }

  return prisma.form.create({
    data: {
      title: source.isTemplate ? source.title : `${source.title} (copy)`,
      description: source.description,
      headerImageUrl: source.headerImageUrl,
      themeColor: source.themeColor,
      category: source.category,
      status: "DRAFT",
      allowMultipleSubmissions: source.allowMultipleSubmissions,
      feedbackTargetType: source.feedbackTargetType,
      feedbackTargetLabel: source.feedbackTargetLabel,
      createdById: actor.id,
      sections: {
        create: source.sections.map((section) => ({
          title: section.title,
          description: section.description,
          order: section.order,
          questions: {
            create: section.questions.map((question) => ({
              type: question.type,
              title: question.title,
              description: question.description,
              required: question.required,
              order: question.order,
              config: question.config as object,
              templateId: question.templateId,
            })),
          },
        })),
      },
    },
  });
}

// Permanent. The form's sections, questions, invitations and responses go
// with it (cascade). Chat messages that sent the form are marked deleted, the
// same way a deleted chat message shows, so nobody is left with a card that
// opens nothing. The audit entry keeps what was removed and by whom.
export async function deleteForm(actor: Actor, formId: string): Promise<{ responseCount: number }> {
  requireStaff(actor);
  const form = await requireOwnedForm(actor, formId);

  return prisma.$transaction(async (tx) => {
    const [responseCount, invitations] = await Promise.all([
      tx.formResponse.count({ where: { formId } }),
      tx.formInvitation.findMany({ where: { formId, messageId: { not: null } }, select: { messageId: true }, distinct: ["messageId"] }),
    ]);
    const messageIds = invitations.map((i) => i.messageId).filter((id): id is string => id !== null);
    if (messageIds.length > 0) {
      await tx.message.updateMany({
        where: { id: { in: messageIds }, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: actor.id },
      });
    }
    await tx.form.delete({ where: { id: formId } });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: AuditAction.FORM_DELETED,
        entityType: "Form",
        entityId: formId,
        metadata: { title: form.title, wasTemplate: form.isTemplate, status: form.status, responseCount },
      },
    });
    return { responseCount };
  });
}
