import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
export type OverviewGettingStartedStepProps = {
  step: {
    kind: string;
    label: string;
    detail: string;
    done: boolean;
    number: number;
  };
};
export function OverviewGettingStartedStep({
  step: s,
}: OverviewGettingStartedStepProps) {
  const { done, number } = s;
  return (
    <Button
      variant="outline"
      className="h-auto justify-start gap-3 whitespace-normal bg-card/80 p-4 text-left"
      data-overview-kind={s.kind}
    >
      {done ? (
        <CheckCircle2 className="size-5 shrink-0 text-primary" />
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
          {number}
        </span>
      )}
      <span>
        <span className="block text-xs font-medium">{s.label}</span>
        <span className="mt-1 block text-[11px] leading-5 font-normal text-muted-foreground">
          {s.detail}
        </span>
      </span>
    </Button>
  );
}
