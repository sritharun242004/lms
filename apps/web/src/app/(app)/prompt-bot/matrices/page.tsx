import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canEditMatrices } from "@/lib/prompt-bot/matrix-input";
import { MatrixEditor } from "./matrix-editor";

export default async function MatricesPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");
  if (!canEditMatrices(user.role)) return redirect("/prompt-bot");
  const matrices = await prisma.promptMatrix.findMany({
    where: { kind: { not: "SKILL" } },
    include: { questions: { orderBy: { order: "asc" } } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Question matrices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design Think is always applied. Task matrices add questions when Prompt Bot detects that kind of task.
        </p>
      </header>
      <MatrixEditor initial={JSON.parse(JSON.stringify(matrices))} />
    </div>
  );
}
