import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { RegistrationsDashboard } from "@/components/admin/registrations-dashboard";
import { WhatsAppGroupsManager } from "@/components/admin/whatsapp-groups-manager";

export default async function AdminRegistrationsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const registrations = await prisma.workshopRegistration.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      paymentProofs: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { id: true, mimeType: true, submittedAt: true },
      },
      verificationLogs: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          note: true,
          createdAt: true,
          adminId: true,
          admin: { select: { name: true, email: true } },
        },
      },
    },
  });
  const grouped = await prisma.workshopRegistration.groupBy({
    by: ["status"],
    _count: true,
    _sum: { amountInInr: true },
  });
  const summary = {
    total: grouped.reduce((sum, g) => sum + g._count, 0),
    byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
    approvedRevenueInInr: grouped.find((g) => g.status === "APPROVED")?._sum.amountInInr ?? 0,
  };

  const whatsAppGroups = await prisma.whatsAppGroup.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-10">
      <RegistrationsDashboard
        registrations={JSON.parse(JSON.stringify(registrations))}
        summary={summary}
      />
      <WhatsAppGroupsManager groups={JSON.parse(JSON.stringify(whatsAppGroups))} />
    </div>
  );
}
