import type { LucideIcon } from "lucide-react";

import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { IntegrationConnection } from "./IntegrationConnection";
export type IntegrationSectionProps = {
  item: { kind: string; title: string; desc: string; icon: LucideIcon };
  resources: Resource[];
  admin: boolean;
};
export function IntegrationSection({
  item,
  resources,
  admin,
}: IntegrationSectionProps) {
  const connections = resources.filter(
    (resource) => resource.kind === item.kind,
  );
  const canCreate =
    admin ||
    (item.kind === "webhook" &&
      resources.some(
        (resource) => resource.kind === "team" && resource.canWrite,
      ));
  return (
    <section aria-labelledby={`integration-${item.kind}`}>
      <Card className="gap-0 overflow-hidden pb-0 shadow-none">
        <CardHeader className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
              <item.icon className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle id={`integration-${item.kind}`} className="text-base">
                {item.title}
              </CardTitle>
              <CardDescription>{item.desc}</CardDescription>
            </div>
          </div>
          <Button
            disabled={!canCreate}
            variant="outline"
            data-action="create"
            data-kind={item.kind}
          >
            <Plus />
            Add connection
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!connections.length && (
            <p className="border-t px-6 py-5 text-sm text-muted-foreground">
              No {item.title.toLowerCase()} connections yet.
            </p>
          )}
          <div>
            {connections.map((resource) => (
              <IntegrationConnection key={resource.id} resource={resource} />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
