import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { RegistrationsDashboard } from "@/components/admin/registrations-dashboard";
import { getRegistrationSummary } from "@/lib/workshop/registration-summary";

export default async function AdminRegistrationsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const registrations = await prisma.workshopRegistration.findMany({
    orderBy: { createdAt: "desc" },
  });
  const summary = await getRegistrationSummary();

  return <RegistrationsDashboard registrations={JSON.parse(JSON.stringify(registrations))} summary={summary} />;
}
