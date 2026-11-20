import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");

  const registrations = await prisma.workshopRegistration.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { registrationCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const grouped = await prisma.workshopRegistration.groupBy({
    by: ["status"],
    _count: true,
    _sum: { amountInInr: true },
  });

  const summary = {
    total: grouped.reduce((sum, g) => sum + g._count, 0),
    byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
    paymentDoneRevenueInInr: grouped.find((g) => g.status === "PAYMENT_DONE")?._sum.amountInInr ?? 0,
  };

  return successResponse({ registrations, summary });
}
