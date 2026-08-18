import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageMotion } from "@/components/layout/page-motion";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden text-foreground">
      <div className="ambient-orb -top-40 -right-32 size-[38rem] bg-primary/24" />
      <div className="ambient-orb -bottom-44 -left-36 size-[34rem] bg-brand-200/60 [animation-delay:-7s]" />
      <div className="relative z-10 mx-auto grid min-h-svh w-full max-w-7xl lg:grid-cols-[.92fr_1.08fr]">
        <section className="flex min-h-svh flex-col p-6 sm:p-10 lg:p-14">
        <div>
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(37,99,235,.22)]">
              <MessagesSquare className="size-4" />
            </span>
            AI Empowerment
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="glass w-full max-w-md rounded-[2rem] p-6 sm:p-8">
            <PageMotion>{children}</PageMotion>
          </div>
        </div>
        </section>
        <aside className="relative hidden overflow-hidden bg-primary p-14 text-primary-foreground lg:flex lg:flex-col lg:justify-end">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:40px_40px]" />
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold tracking-[.16em] uppercase">Staff workspace</p>
            <h2 className="mt-5 text-4xl font-bold tracking-tight">Manage every learning community from one place.</h2>
            <p className="mt-5 text-lg text-primary-foreground/80">Secure access for approved coaches and Super Admins.</p>
          </div>
        </aside>
      </div>

    </div>
  );
}
