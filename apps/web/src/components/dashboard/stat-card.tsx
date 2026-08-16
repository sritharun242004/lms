import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="flex flex-col">
          <span className="text-3xl font-bold tabular-nums leading-none tracking-tight">{value}</span>
          <span className="mt-1 text-sm text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}
