import { ChevronRight, Layers3 } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";
import type { indexResources } from "@/lib/resource-index";

import { Card, CardContent } from "@/components/ui/card";
import { ago } from "@/lib/format";
export type OverviewProjectCardProps = {
  project: Resource;
  index: ReturnType<typeof indexResources>;
};
export function OverviewProjectCard({
  project: p,
  index,
}: OverviewProjectCardProps) {
  const environmentCount = (index.byParent.get(p.id) || []).filter(
    (resource) => resource.kind === "environment",
  ).length;
  const applicationCount = (index.byKind.get("application") || []).filter(
    (resource) =>
      resource.teamId === p.teamId &&
      index.byId.get(resource.parentId || "")?.parentId === p.id,
  ).length;
  return (
    <Link to={`/projects/${p.id}`}>
      <Card className="gap-0 py-0 shadow-none hover:border-primary/40">
        <CardContent className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/50 text-primary">
              <Layers3 className="size-5" />
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">{p.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {environmentCount} environments <span className="mx-2">·</span>
            {applicationCount} applications
          </p>
          <div className="mt-5 flex items-center justify-between border-t pt-4 text-[11px] text-muted-foreground">
            <span>
              {index.byId.get(p.teamId || "")?.name || "Team workspace"}
            </span>
            <span>{ago(p.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
