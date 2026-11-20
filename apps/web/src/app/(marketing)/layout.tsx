import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { SmoothScroll } from "@/components/workshop/landing/smooth-scroll";

export const metadata: Metadata = {
  title: "X Intelligence · AI Empowerment Workshop",
};

// Display serif for headlines only — body copy stays in the app's own
// Manrope sans (set on <body> by the root layout). This one pairing is
// most of what separates an editorial feel from a generic SaaS page.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

// Deliberately outside both (auth) and (app): no auth check, no app
// chrome. Keeps the public workshop page from depending on anything
// session-related.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} min-h-svh bg-background text-foreground`}>
      <SmoothScroll>{children}</SmoothScroll>
    </div>
  );
}
