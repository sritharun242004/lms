import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { getAnswerFileDownload } from "@/lib/forms/answer-files";
import { FormError } from "@/lib/forms/form-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  // Answer files belong to form responses, which only staff review. Files
  // carry no uploader, so a participant could otherwise read anyone's by id.
  if (user.role !== "ADMIN" && user.role !== "MENTOR") {
    return errorResponse("You don't have access to this file", "FORBIDDEN", 403);
  }

  const { id } = await params;
  try {
    const download = await getAnswerFileDownload(id);
    if (!download) return errorResponse("File not found", "NOT_FOUND", 404);
    if (download.kind === "redirect") {
      // A short-lived signed link straight to S3; never cached, since it expires.
      return NextResponse.redirect(download.url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }
    return new NextResponse(download.data, {
      headers: { ...download.headers, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof FormError) return errorResponse(error.message, error.code, error.status);
    throw error;
  }
}
