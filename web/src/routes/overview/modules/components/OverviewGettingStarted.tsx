import type { MouseEvent } from "react";

import type { Resource } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { OverviewGettingStartedStep } from "./OverviewGettingStartedStep";

export type OverviewGettingStartedProps = {
  rows: Resource[];
  openEditor: (kind: string) => void;
};
export function OverviewGettingStarted({
  rows,
  openEditor,
}: OverviewGettingStartedProps) {
  const steps = [
    {
      kind: "team",
      label: "Create a team",
      detail: "Give your projects a home.",
    },
    {
      kind: "server",
      label: "Connect a server",
      detail: "A standalone Docker host, over SSH.",
    },
    {
      kind: "git",
      label: "Connect your repository",
      detail: "Bring GitHub or Gitea aboard.",
    },
    {
      kind: "project",
      label: "Create your first project",
      detail: "Organize apps and environments.",
    },
  ];
  const progress = steps.map((step, index) => ({
    ...step,
    done: rows.some((resource) => resource.kind === step.kind),
    number: index + 1,
  }));
  function handleStepClick(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-overview-kind]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    if (button.dataset.overviewKind) openEditor(button.dataset.overviewKind);
  }
  return (
    <Card className="mb-8 overflow-hidden border-primary/15 bg-gradient-to-br from-primary/8 via-card to-card py-0 shadow-none">
      <CardContent className="grid gap-8 p-7 md:grid-cols-[1fr_1.3fr]">
        <div>
          <Badge
            className="mb-5 border-primary/20 bg-primary/5 font-mono text-[10px] tracking-wider text-primary"
            variant="outline"
          >
            LET’S GET YOU SHIPPING
          </Badge>
          <h2 className="max-w-xs text-2xl leading-tight font-medium tracking-tight">
            Your next release
            <br />
            starts here.
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            Connect your infrastructure, bring a repository, and deploy.
            Shipyard takes care of the route from there.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            No clusters to manage.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" onClick={handleStepClick}>
          {progress.map((step) => (
            <OverviewGettingStartedStep key={step.kind} step={step} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
