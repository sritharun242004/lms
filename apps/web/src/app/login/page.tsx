import { LandingPage } from "@/components/landing/landing-page";

// The participant session portal. "/" is the public X Intelligence
// landing page; signed-in users never see this page because the proxy
// sends them from public auth routes to their dashboard.
export default function LoginPage() {
  return <LandingPage />;
}
