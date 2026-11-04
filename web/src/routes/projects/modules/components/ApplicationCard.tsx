import { FileCode2, GitBranch } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";
import type { indexResources } from "@/lib/resource-index";

import { RepositoryName } from "@/components/repository-name";
import { ResourceLogo } from "@/components/ResourceLogo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSortableResourceCard } from "@/lib/hooks/useSortableResourceCard";
import { text } from "@/lib/resource-fields";

export type ApplicationCardProps = {
  resource: Resource;
  index: number;
  resourceIndex: ReturnType<typeof indexResources>;
  disabled: boolean;
};
export function ApplicationCard({
  resource: r,
  index,
  resourceIndex,
  disabled,
}: ApplicationCardProps) {
  const { ref, handle } = useSortableResourceCard(r, index, disabled);
  return (
    <Card
      ref={ref}
      data-card-id={r.id}
      className="relative min-w-0 py-0 shadow-none transition-colors hover:border-primary/40 focus-within:border-primary/40"
    >
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <ResourceLogo resource={r} reorderHandle={handle} />
          <Badge variant="secondary" className="font-mono text-[10px]">
            {text(r.data, "engine").toUpperCase()}
          </Badge>
        </div>
        <h3 className="font-medium">
          <Link
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            to={`/applications/${r.id}`}
          >
            {r.name}
          </Link>
        </h3>
        {r.data.workload === "job" && (
          <Badge variant="outline" className="mt-2">
            Job
          </Badge>
        )}
        {!!r.data.deleting && (
          <Badge variant="secondary" className="mt-2">
            {r.data.deletionError ? "Cleanup failed" : "Deleting…"}
          </Badge>
        )}
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {text(r.data, "source") === "compose" ? (
            "Direct Compose"
          ) : (
            <RepositoryName
              repository={text(r.data, "repository")}
              provider={text(
                resourceIndex.byId.get(text(r.data, "gitId"))?.data || {},
                "provider",
              )}
            />
          )}
        </p>
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {text(r.data, "source") === "compose" ? (
              <FileCode2 className="size-3" />
            ) : (
              <GitBranch className="size-3" />
            )}
            {text(r.data, "source") === "compose"
              ? "compose.yaml"
              : text(r.data, "branch")}
          </span>
          <span>
            {resourceIndex.byId.get(text(r.data, "serverId"))?.name || "Server"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
