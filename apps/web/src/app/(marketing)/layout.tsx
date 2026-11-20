import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { SmoothScroll } from "@/components/workshop/landing/smooth-scroll";
import { BrandPalette } from "@/components/workshop/landing/brand-palette";

export const metadata: Metadata = {
  // The public homepage carries the brand alone, not the app's "| CMS" suffix.
  title: { absolute: "X Intelligence · AI Empowerment Workshop" },
};

// A single warm, heavy grotesk for both display and text — the type
// direction this page was redesigned around treats typography itself
// as the image, so display and body stay in one family rather than
// pairing a serif against the app's own Manrope.
const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
});

// Deliberately outside both (auth) and (app): no auth check, no app
// chrome. Keeps the public workshop page from depending on anything
// session-related.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${schibstedGrotesk.variable} light min-h-svh bg-white text-slate-900 font-[family-name:var(--font-schibsted)]`}
    >
      <BrandPalette />
      <SmoothScroll>{children}</SmoothScroll>
    </div>
  );
}
