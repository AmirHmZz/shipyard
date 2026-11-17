import type { ReactNode } from "react";

import { Progress } from "@/components/ui/progress";

export type ServerMetricProps = {
  label: string;
  value?: number;
  icon: ReactNode;
};

export function ServerMetric({ label, value, icon }: ServerMetricProps) {
  const usage =
    typeof value === "number" ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/10 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-3.5">
        {icon}
        {label}
      </p>
      <p className="font-mono text-lg font-medium tracking-tight">
        {typeof value === "number" ? value.toFixed(1) : "—"}
        {typeof value === "number" && (
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
            %
          </span>
        )}
      </p>
      <Progress
        className="h-1"
        value={typeof value === "number" ? usage : null}
        aria-label={`${label} usage`}
      />
    </div>
  );
}
