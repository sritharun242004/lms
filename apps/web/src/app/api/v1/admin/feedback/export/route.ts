import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listFeedbackSubmissions } from "@/lib/forms/feedback";
import { FormError } from "@/lib/forms/form-service";
import { errorResponse } from "@/lib/api/response";
import { csvResponseHeaders, rowsToCsv, rowsToXlsxBuffer, xlsxResponseHeaders } from "@/lib/export/spreadsheet";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const formId = url.searchParams.get("formId") || undefined;
  const q = url.searchParams.get("q") || undefined;

  try {
    const submissions = await listFeedbackSubmissions(user, { formId, q });

    const rows = submissions.map((s) => {
      const row: Record<string, unknown> = {
        "Submission Date": s.submittedAt.toISOString(),
        Form: s.formTitle,
        Participant: s.anonymous ? "Anonymous" : s.respondentName ?? "",
        Email: s.anonymous ? "" : s.respondentEmail ?? "",
      };
      for (const answer of s.answers) {
        row[answer.questionTitle] = answer.value;
      }
      return row;
    });

    const filename = `feedback-${new Date().toISOString().slice(0, 10)}.${format}`;
    if (format === "xlsx") {
      return new NextResponse(new Uint8Array(rowsToXlsxBuffer(rows, "Feedback")), { headers: xlsxResponseHeaders(filename) });
    }
    return new NextResponse(rowsToCsv(rows), { headers: csvResponseHeaders(filename) });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
