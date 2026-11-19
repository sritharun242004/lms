import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "X Intelligence · AI Empowerment Workshop",
};

// Deliberately outside both (auth) and (app): no auth check, no app
// chrome. Keeps the public workshop page from depending on anything
// session-related.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">{children}</div>;
}
