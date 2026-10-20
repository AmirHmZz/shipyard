import { ArrowUpRight, Box, GitBranch, Trash2 } from "lucide-react";
import { Link } from "react-router";

import type { Deployment } from "@/lib/api/types";

import { StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { ago } from "@/lib/format";

export type DeploymentTableRowProps = {
  deployment: Deployment;
  applicationName: string;
  selection: "button" | "link";
  deletion: "hidden" | "disabled" | "enabled";
};
export function DeploymentTableRow({
  deployment: d,
  applicationName,
  selection,
  deletion,
}: DeploymentTableRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/applications/${d.applicationId}`}
          className="flex items-center gap-3 font-medium"
        >
          <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/40">
            <Box className="size-4 text-muted-foreground" />
          </div>
          {applicationName}
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
            {d.commit.startsWith("compose:") ? d.commit : d.commit.slice(0, 8)}
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
          {selection === "button" ? (
            <Button
              variant="ghost"
              size="sm"
              data-deployment-id={d.id}
              data-deployment-action="select"
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
          {deletion !== "hidden" && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={
                d.deletionError
                  ? "Retry deployment deletion"
                  : "Delete deployment"
              }
              disabled={deletion === "disabled"}
              data-deployment-id={d.id}
              data-deployment-action="delete"
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
  );
}
