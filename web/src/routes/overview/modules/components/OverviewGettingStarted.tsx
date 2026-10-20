import { CheckCircle2 } from "lucide-react";

import type { Resource } from "@/lib/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function OverviewGettingStarted({
  rows,
  openEditor,
}: {
  rows: Resource[];
  openEditor: (kind: string) => void;
}) {
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
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((s, i) => {
            const done = rows.some((r) => r.kind === s.kind);
            return (
              <Button
                key={s.kind}
                variant="outline"
                className="h-auto justify-start gap-3 whitespace-normal bg-card/80 p-4 text-left"
                onClick={() => openEditor(s.kind)}
              >
                {done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
                    {i + 1}
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
          })}
        </div>
      </CardContent>
    </Card>
  );
}
