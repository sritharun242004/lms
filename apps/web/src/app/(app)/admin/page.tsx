import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminEntryPage() {
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") redirect("/admin/dashboard");
  if (user?.role === "MENTOR") redirect("/coach/dashboard");
  redirect("/admin/login");
}
