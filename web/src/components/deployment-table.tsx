import { StateBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ago, type Deployment, type Resource, useDeployments } from "@/lib/api";
import { indexResources } from "@/lib/resource-index";
import { ArrowUpRight, Box, GitBranch, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useMemo } from "react";
import { Link } from "react-router";

export function DeploymentTable({
  deployments,
  resources,
  onSelect,
  onDelete,
  canDelete,
}: {
  deployments: ReturnType<typeof useDeployments>["data"];
  resources: Resource[];
  onSelect?: (id: string) => void;
  onDelete?: (deployment: Deployment) => void;
  canDelete?: (deployment: Deployment) => boolean;
}) {
  const { byId } = useMemo(() => indexResources(resources), [resources]);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Application</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Source revision</TableHead>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deployments?.map((d) => (
          <TableRow key={d.id}>
            <TableCell>
              <Link
                to={`/applications/${d.applicationId}`}
                className="flex items-center gap-3 font-medium"
              >
                <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/40">
                  <Box className="size-4 text-muted-foreground" />
                </div>
                {byId.get(d.applicationId)?.name || d.applicationId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell>
              <StateBadge state={d.state} />
              {d.deleting && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.deletionError || "Deleting…"}
                </p>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {d.commit ? (
                <span className="flex items-center gap-1.5">
                  <GitBranch className="size-3" />
                  {d.commit.startsWith("compose:")
                    ? d.commit
                    : d.commit.slice(0, 8)}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {ago(d.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {onSelect ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(d.id)}
                  >
                    Logs
                    <ArrowUpRight className="size-3" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      aria-label="View deployment"
                      to={`/applications/${d.applicationId}?deployment=${d.id}`}
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={
                      d.deletionError
                        ? "Retry deployment deletion"
                        : "Delete deployment"
                    }
                    disabled={
                      !canDelete?.(d) || (!!d.deleting && !d.deletionError)
                    }
                    onClick={() => onDelete(d)}
                  >
                    {d.deleting && !d.deletionError ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    {d.deletionError ? (
                      "Retry"
                    ) : (
                      <span className="sr-only">Delete deployment</span>
                    )}
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
