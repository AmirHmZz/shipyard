import type { MouseEvent } from "react";

import {
  Folder,
  KeyRound,
  MoreHorizontal,
  RefreshCw,
  ShieldBan,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { McpToken } from "../generics";

export type McpTokenRowProps = {
  token: McpToken;
  projectNames: Map<string, string>;
  now: number;
  onAction: (event: MouseEvent<HTMLDivElement>) => void;
};
export function McpTokenRow({
  token,
  projectNames,
  now,
  onAction,
}: McpTokenRowProps) {
  const statusDate = token.revokedAt ?? token.expiresAt;
  const date = new Date(statusDate);
  let status = "Active";
  if (token.revokedAt) status = "Revoked";
  else if (date.getTime() <= now) status = "Expired";
  const otherProjects = token.projectIds
    .slice(2)
    .map((id) => projectNames.get(id) ?? "Unavailable project");

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(7rem,0.6fr)_auto] lg:items-center lg:gap-x-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
          <KeyRound className="size-4" aria-hidden="true" />
        </div>
        <h3 className="min-w-0 text-sm font-semibold wrap-break-word">
          {token.name}
        </h3>
      </div>
      <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:col-span-1 lg:row-start-auto">
        {token.projectIds.slice(0, 2).map((id) => (
          <span
            key={id}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-muted/35 px-2 py-1 text-xs"
          >
            <Folder
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 wrap-break-word">
              {projectNames.get(id) ?? "Unavailable project"}
            </span>
          </span>
        ))}
        {otherProjects.length > 0 && (
          <span
            className="text-xs text-muted-foreground"
            title={otherProjects.join(", ")}
          >
            +{otherProjects.length} more
          </span>
        )}
        {token.projectIds.length === 0 && (
          <span className="text-sm text-muted-foreground">No projects</span>
        )}
      </div>
      <div className="col-span-2 row-start-3 flex flex-wrap items-center gap-x-2 gap-y-1 lg:col-span-1 lg:row-start-auto lg:flex-col lg:items-start">
        <Badge
          variant="outline"
          className={cn(
            status === "Active" &&
              "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            status === "Expired" &&
              "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-400",
            status === "Revoked" && "text-muted-foreground",
          )}
        >
          <span
            className="size-1.5 rounded-full bg-current"
            aria-hidden="true"
          />
          {status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {status === "Active" && "Expires "}
          <time dateTime={statusDate} title={date.toLocaleString()}>
            {date.toLocaleDateString(undefined, { dateStyle: "medium" })}
          </time>
        </span>
      </div>
      <div className="col-start-2 row-start-1 justify-self-end lg:col-start-4">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              id={`mcp-token-actions-${token.id}`}
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${token.name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              data-token={token.id}
              data-action="edit"
              onClick={onAction}
            >
              <SlidersHorizontal aria-hidden="true" /> Edit access
            </DropdownMenuItem>
            <DropdownMenuItem
              data-token={token.id}
              data-action="recreate"
              onClick={onAction}
              disabled={token.projectIds.length === 0}
            >
              <RefreshCw aria-hidden="true" /> Recreate token
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!token.revokedAt && (
              <DropdownMenuItem
                data-token={token.id}
                data-action="revoke"
                onClick={onAction}
              >
                <ShieldBan aria-hidden="true" /> Revoke token
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              data-token={token.id}
              data-action="delete"
              onClick={onAction}
              variant="destructive"
            >
              <Trash2 aria-hidden="true" /> Delete record
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
