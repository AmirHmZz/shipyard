import type { LucideIcon } from "lucide-react";

export type MonitoringStatProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
};
export function MonitoringStat({
  label,
  value,
  description,
  icon: Icon,
}: MonitoringStatProps) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-4 py-3">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        {label}
      </dt>
      <dd className="mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      <dd className="mt-1.5 text-xs text-muted-foreground">{description}</dd>
    </div>
  );
}
