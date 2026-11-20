import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { FormsRepository } from "@/components/forms/forms-repository";

export default async function FormsPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MENTOR" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  const forms = await prisma.form.findMany({
    where: user.role === "ADMIN" ? {} : { createdById: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sections: true, responses: true } } },
  });

  return <FormsRepository forms={JSON.parse(JSON.stringify(forms))} />;
}
