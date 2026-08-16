"use client";

import { usePathname } from "next/navigation";
import { isFocusedGroupPath } from "@/lib/cms/task-requirements";

export function AppFrame({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const focused = isFocusedGroupPath(usePathname());
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden text-foreground">
      <div className="ambient-orb -top-40 -right-32 size-[36rem] bg-primary/20" />
      <div className="ambient-orb -bottom-52 -left-40 size-[34rem] bg-brand-200/55 [animation-delay:-8s]" />
      {!focused && header}
      <main className={focused ? "relative z-10 flex min-h-svh flex-1" : "relative z-10 mx-auto w-full max-w-[1500px] flex-1 p-4 pt-6 md:p-6 md:pt-8"}>{children}</main>
    </div>
  );
}
