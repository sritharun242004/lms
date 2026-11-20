import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { RegistrationsDashboard } from "@/components/admin/registrations-dashboard";

export default async function AdminRegistrationsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const registrations = await prisma.workshopRegistration.findMany({
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

  return <RegistrationsDashboard registrations={JSON.parse(JSON.stringify(registrations))} summary={summary} />;
}
