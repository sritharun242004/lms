import { prisma } from "@/lib/db/prisma";
import { requireStaff, FormError } from "./form-service";
import type { FormQuestionTemplate, FormQuestionType } from "@prisma/client";

type Actor = { id: string; role: string };

export async function createQuestionTemplate(
  actor: Actor,
  input: {
    title: string;
    type: FormQuestionType;
    description?: string;
    config?: Record<string, unknown>;
    category?: string;
    tags?: string[];
  }
): Promise<FormQuestionTemplate> {
  requireStaff(actor);
  if (!input.title.trim()) throw new FormError("Title is required", "VALIDATION_ERROR", 400);

  return prisma.formQuestionTemplate.create({
    data: {
      title: input.title.trim(),
      type: input.type,
      description: input.description,
      config: input.config ?? {},
      category: input.category,
      tags: input.tags ?? [],
      createdById: actor.id,
    },
  });
}

export async function listQuestionTemplates(
  actor: Actor,
  filters: { type?: FormQuestionType; category?: string; search?: string }
) {
  requireStaff(actor);
  return prisma.formQuestionTemplate.findMany({
    where: {
      ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateQuestionTemplate(
  actor: Actor,
  templateId: string,
  patch: Partial<{ title: string; description: string | null; config: Record<string, unknown>; category: string | null; tags: string[] }>
): Promise<FormQuestionTemplate> {
  const template = await prisma.formQuestionTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new FormError("Question template not found", "NOT_FOUND", 404);
  if (template.createdById !== actor.id && actor.role !== "ADMIN") {
    throw new FormError("You do not have access to this template", "FORBIDDEN", 403);
  }
  return prisma.formQuestionTemplate.update({ where: { id: templateId }, data: patch });
}

// Inserting a template into a form copies its fields into a brand new
// FormQuestion row with templateId set for provenance only — editing the
// template afterward never mutates questions already copied from it,
// matching the same discipline QuestionLibraryItem's publish flow uses.
export async function insertTemplateIntoSection(
  actor: Actor,
  templateId: string,
  sectionId: string
) {
  requireStaff(actor);
  const template = await prisma.formQuestionTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new FormError("Question template not found", "NOT_FOUND", 404);

  const section = await prisma.formSection.findUnique({ where: { id: sectionId } });
  if (!section) throw new FormError("Section not found", "NOT_FOUND", 404);

  const maxOrder = await prisma.formQuestion.aggregate({
    where: { sectionId },
    _max: { order: true },
  });

  return prisma.formQuestion.create({
    data: {
      sectionId,
      templateId: template.id,
      type: template.type,
      title: template.title,
      description: template.description,
      config: template.config as object,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}
