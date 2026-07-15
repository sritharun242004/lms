import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Mentor Connect CMS",
    template: "%s | Mentor Connect CMS",
  },
  description:
    "A modern Learning Management Portal with WhatsApp-inspired communication. Connect mentors with mentees through real-time announcements and group management.",
  keywords: [
    "CMS",
    "Learning Management System",
    "Mentor",
    "Mentee",
    "Education",
    "Communication",
    "WhatsApp",
  ],
  authors: [{ name: "Mentor Connect" }],
  creator: "Mentor Connect",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Mentor Connect CMS",
    title: "Mentor Connect CMS",
    description:
      "A modern Learning Management Portal with WhatsApp-inspired communication.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
