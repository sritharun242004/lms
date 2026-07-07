import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: "/admin/dashboard",
  MENTOR: "/mentor/dashboard",
  // Mentees have no dashboard — chat is their home.
  MENTEE: "/chat",
};

export default async function DashboardRedirectPage() {
  const user = await getCurrentUser();
  redirect(ROLE_DASHBOARD[user?.role ?? "MENTEE"] ?? "/chat");
}
