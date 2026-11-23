import { prisma } from "@/lib/db/prisma";

export type RegistrationSummary = {
  total: number;
  byStatus: Record<string, number>;
  // Participants who clicked "Payment Done" themselves.
  participantMarkedPaid: number;
  // Registrations an admin has checked and switched to Paid.
  verifiedPaid: number;
  verifiedRevenueInInr: number;
};

export async function getRegistrationSummary(): Promise<RegistrationSummary> {
  const [grouped, verified] = await Promise.all([
    prisma.workshopRegistration.groupBy({ by: ["status"], _count: true }),
    prisma.workshopRegistration.aggregate({
      where: { paymentVerifiedAt: { not: null } },
      _count: true,
      _sum: { amountInInr: true },
    }),
  ]);
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  return {
    total: grouped.reduce((sum, g) => sum + g._count, 0),
    byStatus,
    participantMarkedPaid: byStatus.PAYMENT_DONE ?? 0,
    verifiedPaid: verified._count,
    verifiedRevenueInInr: verified._sum.amountInInr ?? 0,
  };
}
