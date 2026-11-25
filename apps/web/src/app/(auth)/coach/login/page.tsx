import { redirect } from "next/navigation";
import { staffLoginRedirect } from "@/lib/auth/portal-navigation";

// Old bookmark: forward to the one staff login, keeping where the person was
// headed (only ever a path on this site).
export default async function CoachLoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect: returnTo } = await searchParams;
  redirect(staffLoginRedirect(returnTo));
}
