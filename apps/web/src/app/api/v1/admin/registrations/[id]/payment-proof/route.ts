import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const { id } = await params;
  const proof = await prisma.paymentProof.findFirst({
    where: { registrationId: id },
    orderBy: { submittedAt: "desc" },
  });
  if (!proof) return errorResponse("No payment proof on file", "NOT_FOUND", 404);

  return new NextResponse(new Uint8Array(proof.data), {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(proof.size),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
