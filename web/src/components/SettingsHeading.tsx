import type { ReactNode } from "react";

export type SettingsHeadingProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function SettingsHeading({
  title,
  description,
  action,
}: SettingsHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
