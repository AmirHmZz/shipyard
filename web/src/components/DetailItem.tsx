import type { ReactNode } from "react";

export type DetailItemProps = {
  label: string;
  children: ReactNode;
};

export function DetailItem({ label, children }: DetailItemProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-sm font-medium">{children}</dd>
    </div>
  );
}
