import type { ReactNode } from "react";

import { FlushCard } from "@/components/FlushCard";

export type SettingsSectionProps = {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({
  title,
  description,
  icon,
  action,
  children,
}: SettingsSectionProps) {
  return (
    <FlushCard className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary [&>svg]:size-4"
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </FlushCard>
  );
}
