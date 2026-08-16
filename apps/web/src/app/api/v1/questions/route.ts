import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { normalizeQuizDraft } from "@/lib/cms/task-requirements";

const allowed = (role?: string) => role === "ADMIN" || role === "MENTOR";

function rowToQuiz(row: Record<string, unknown>, index = 0) {
  const question = String(row.Question ?? row.question ?? "").trim();
  return normalizeQuizDraft({
    name: String(row.Name ?? row.name ?? row.Quiz ?? row.quiz ?? row.Title ?? row.title ?? (question || `Imported quiz ${index + 1}`)),
    question,
    options: [
      row.Option1 ?? row.option1,
      row.Option2 ?? row.option2,
      row.Option3 ?? row.option3,
      row.Option4 ?? row.option4,
      row.Option5 ?? row.option5,
      row.Option6 ?? row.option6,
      row.Option7 ?? row.option7,
      row.Option8 ?? row.option8,
    ].filter((value) => value !== undefined && value !== null).map(String),
    chartType: String(row.ChartType ?? row.chartType ?? "BAR").toUpperCase() as "BAR" | "DONUT" | "PIE",
  });
}

async function createQuiz(userId: string, quiz: ReturnType<typeof normalizeQuizDraft>) {
  return prisma.questionLibraryItem.create({
    data: {
      name: quiz.name,
      question: quiz.question,
      chartType: quiz.chartType,
      createdById: userId,
      options: { create: quiz.options.map((text, order) => ({ text, order })) },
    },
    include: {
      options: { orderBy: { order: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const items = await prisma.questionLibraryItem.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      options: { orderBy: { order: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  return successResponse({ items });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  try {
    const body = await req.json();
    const quiz = normalizeQuizDraft({
      name: String(body.name ?? ""),
      question: String(body.question ?? ""),
      options: Array.isArray(body.options) ? body.options.map(String) : [],
      chartType: body.chartType,
    });
    const item = await createQuiz(user.id, quiz);
    return successResponse({ item }, undefined, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to save quiz", "QUIZ_SAVE_ERROR", 400);
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !allowed(user.role)) return errorResponse("Staff access required", "FORBIDDEN", 403);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a CSV or Excel file", "FILE_REQUIRED", 400);
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return errorResponse("Only CSV or Excel files are supported", "INVALID_FILE_TYPE", 400);
  try {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]]);
    const quizzes = rows.map(rowToQuiz);
    if (!quizzes.length) return errorResponse("The spreadsheet does not contain any quizzes", "EMPTY_FILE", 400);
    const items = [];
    for (const quiz of quizzes) items.push(await createQuiz(user.id, quiz));
    return successResponse({ count: items.length, items }, undefined, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not read the uploaded file", "IMPORT_ERROR", 400);
  }
}
