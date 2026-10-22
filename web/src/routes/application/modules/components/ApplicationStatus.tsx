import { FileCode2, GitBranch, Server } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { text } from "@/lib/resource-fields";

import type { Runtime } from "../generics";

export type ApplicationStatusProps = {
  app: Resource;
  runtime: { data?: Runtime };
  server?: Resource;
};
export function ApplicationStatus({
  app,
  runtime,
  server,
}: ApplicationStatusProps) {
  const directCompose = app.data.source === "compose";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border bg-card px-5 py-4 text-xs">
      <StateBadge state={runtime.data?.status} />
      {app.data.workload === "job" && <Badge variant="secondary">Job</Badge>}
      {runtime.data?.status === "stopped" && (
        <span className="text-muted-foreground">
          Automatic deployments paused
        </span>
      )}
      {runtime.data?.error && (
        <span role="alert" className="text-destructive">
          {runtime.data.error}
        </span>
      )}
      <span className="flex items-center gap-2 text-muted-foreground">
        {directCompose ? (
          <FileCode2 className="size-3.5" />
        ) : (
          <GitBranch className="size-3.5" />
        )}
        {directCompose ? "Direct Compose" : text(app.data, "branch")}
        <span className="font-mono">
          {directCompose
            ? runtime.data?.commit?.replace("compose:", "")
            : runtime.data?.commit?.slice(0, 8)}
        </span>
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <Server className="size-3.5" />
        {server?.name || "Server"}
      </span>
      <Badge variant="outline" className="ml-auto font-mono text-[10px]">
        {text(app.data, "engine").toUpperCase()}
      </Badge>
    </div>
  );
}
