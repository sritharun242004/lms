import { prisma } from "@/lib/db/prisma";
import { requireStaff, FormError } from "./form-service";
import { answerFilePath } from "./file-links";

type Actor = { id: string; role: string };

async function requireViewableForm(actor: Actor, formId: string) {
  requireStaff(actor);
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
      responses: {
        orderBy: { submittedAt: "asc" },
        include: { answers: true, respondent: { select: { name: true } } },
      },
      invitations: true,
    },
  });
  if (!form) throw new FormError("Form not found", "NOT_FOUND", 404);
  if (form.createdById !== actor.id && actor.role !== "ADMIN") {
    throw new FormError("You do not have access to this form's analytics", "FORBIDDEN", 403);
  }
  return form;
}

export type QuestionSummary =
  | { questionId: string; title: string; type: "CHOICE"; counts: Record<string, number> }
  | { questionId: string; title: string; type: "RATING"; average: number; distribution: Record<number, number> }
  | { questionId: string; title: string; type: "TEXT"; answers: string[] }
  | { questionId: string; title: string; type: "FILES"; files: { fileId: string; fileName: string }[] };

type FileAnswer = { fileId: string; fileName?: string };

function isFileAnswer(value: unknown): value is FileAnswer {
  return typeof value === "object" && value !== null && typeof (value as { fileId?: unknown }).fileId === "string";
}

// One readable line per answer, whatever its shape: grids read as
// "Row: choice", lists as "a; b". Anything unrecognised is still shown
// rather than silently dropped.
function answerText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(answerText).join("; ");
  if (isFileAnswer(value)) return value.fileName ?? value.fileId;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([row, cell]) => `${row}: ${answerText(cell)}`)
      .join(", ");
  }
  return String(value);
}

export async function getFormAnalytics(actor: Actor, formId: string) {
  const form = await requireViewableForm(actor, formId);
  const questions = form.sections.flatMap((s) => s.questions);
  const totalResponses = form.responses.length;
  // Of the people this form was sent to in chat, how many answered. Public
  // link responses have no invitation, so they are counted on their own.
  const submittedInvitations = form.invitations.filter((i) => i.status === "SUBMITTED").length;
  const completionRate = form.invitations.length > 0 ? submittedInvitations / form.invitations.length : null;
  const publicLinkResponses = form.responses.filter((r) => r.invitationId === null).length;

  const questionSummaries: QuestionSummary[] = questions.map((question) => {
    const values = form.responses.flatMap((r) => r.answers).filter((a) => a.questionId === question.id).map((a) => a.value);

    if (question.type === "LINEAR_SCALE" || question.type === "STAR_RATING") {
      const numbers = values.filter((v): v is number => typeof v === "number");
      const distribution: Record<number, number> = {};
      for (const n of numbers) distribution[n] = (distribution[n] ?? 0) + 1;
      return {
        questionId: question.id,
        title: question.title,
        type: "RATING",
        average: numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0,
        distribution,
      };
    }

    if (
      question.type === "MULTIPLE_CHOICE" ||
      question.type === "DROPDOWN" ||
      question.type === "CHECKBOXES"
    ) {
      const counts: Record<string, number> = {};
      for (const value of values) {
        const options = Array.isArray(value) ? value : [value];
        for (const option of options) {
          if (typeof option !== "string") continue;
          counts[option] = (counts[option] ?? 0) + 1;
        }
      }
      return { questionId: question.id, title: question.title, type: "CHOICE", counts };
    }

    if (question.type === "FILE_UPLOAD") {
      return {
        questionId: question.id,
        title: question.title,
        type: "FILES",
        files: values.filter(isFileAnswer).map((v) => ({ fileId: v.fileId, fileName: v.fileName ?? "File" })),
      };
    }

    return {
      questionId: question.id,
      title: question.title,
      type: "TEXT",
      answers: values.map(answerText).filter(Boolean),
    };
  });

  return {
    formId: form.id,
    title: form.title,
    totalResponses,
    invitationsSent: form.invitations.length,
    completionRate,
    publicLinkResponses,
    questionSummaries,
    responseTable: buildResponseTable(questions, form.responses),
  };
}

export type ResponseCell =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "files"; files: { fileId: string; fileName: string }[] };

export type ResponseTable = {
  identityTitle: string;
  columns: { questionId: string; title: string; type: string }[];
  rows: {
    responseId: string;
    submittedAt: string;
    name: string;
    source: "CHAT" | "PUBLIC_LINK";
    cells: ResponseCell[];
  }[];
};

type TableQuestion = { id: string; title: string; type: string };
type TableResponse = {
  id: string;
  submittedAt: Date;
  anonymous: boolean;
  invitationId: string | null;
  respondent: { name: string } | null;
  answers: { questionId: string; value: unknown }[];
};

// Public-link responses carry no account, so the only name is the one the
// person typed. Use the form's own name question as the row label when it
// has one.
function findNameQuestion(questions: TableQuestion[]): TableQuestion | undefined {
  return questions.find((q) => q.type === "SHORT_ANSWER" && /\bname\b/i.test(q.title));
}

function toCell(value: unknown): ResponseCell {
  if (isFileAnswer(value)) return { kind: "files", files: [{ fileId: value.fileId, fileName: value.fileName ?? "File" }] };
  if (Array.isArray(value) && value.length > 0 && value.every(isFileAnswer)) {
    return { kind: "files", files: value.map((v) => ({ fileId: v.fileId, fileName: v.fileName ?? "File" })) };
  }
  const text = answerText(value).trim();
  return text ? { kind: "text", text } : { kind: "empty" };
}

// One row per submission, one cell per question, read from that submission
// alone — so a skipped answer leaves a blank cell instead of shifting
// everyone else's answers up, as the per-question summary lists do.
function buildResponseTable(questions: TableQuestion[], responses: TableResponse[]): ResponseTable {
  const nameQuestion = findNameQuestion(questions);
  const columns = questions.filter((q) => q.id !== nameQuestion?.id);

  return {
    identityTitle: nameQuestion?.title ?? "Respondent",
    columns: columns.map((q) => ({ questionId: q.id, title: q.title, type: q.type })),
    rows: responses.map((response) => {
      const byQuestion = new Map(response.answers.map((a) => [a.questionId, a.value]));
      const typedName = nameQuestion ? answerText(byQuestion.get(nameQuestion.id)).trim() : "";
      const accountName = response.anonymous ? "" : response.respondent?.name ?? "";
      return {
        responseId: response.id,
        submittedAt: response.submittedAt.toISOString(),
        name: typedName || accountName || "Anonymous",
        source: response.invitationId === null ? "PUBLIC_LINK" : "CHAT",
        cells: columns.map((q) => toCell(byQuestion.get(q.id))),
      };
    }),
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellText(value: unknown, appUrl: string): string {
  if (isFileAnswer(value)) return `${value.fileName ?? "File"} (${appUrl}${answerFilePath(value.fileId)})`;
  return answerText(value);
}

export async function exportFormResponsesCsv(actor: Actor, formId: string): Promise<string> {
  const form = await requireViewableForm(actor, formId);
  const questions = form.sections.flatMap((s) => s.questions);

  // Absolute links so they open from a spreadsheet; the link still needs a
  // staff sign-in.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const header = ["Response ID", "Submitted At", "Respondent", ...questions.map((q) => q.title)];
  const rows = form.responses.map((response) => {
    const byQuestion = new Map(response.answers.map((a) => [a.questionId, a.value]));
    return [
      response.id,
      response.submittedAt.toISOString(),
      response.anonymous ? "Anonymous" : response.respondent?.name ?? "Deleted user",
      ...questions.map((q) => cellText(byQuestion.get(q.id), appUrl)),
    ];
  });

  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");
}
