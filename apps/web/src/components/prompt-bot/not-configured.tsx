import { Sparkles } from "lucide-react";

export function NotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="glass mx-auto max-w-xl rounded-[1.75rem] p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold">Prompt Bot isn&apos;t configured yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">It will be available as soon as an administrator connects the AI service.</p>
      {isAdmin && (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-left font-mono text-xs dark:bg-white/5">
          Set ANTHROPIC_API_KEY in the web service environment (apps/web/.env locally, App Runner in production).
        </p>
      )}
    </div>
  );
}
