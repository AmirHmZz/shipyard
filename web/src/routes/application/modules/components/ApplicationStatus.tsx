import { FileCode2, GitBranch, Server } from "lucide-react";

import { StateBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { text, type Resource } from "@/lib/api";

import type { Runtime } from "../generics";

export function ApplicationStatus({
  app,
  runtime,
  server,
}: {
  app: Resource;
  runtime: { data?: Runtime };
  server?: Resource;
}) {
  const directCompose = app.data.source === "compose";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border bg-card px-5 py-4 text-xs">
      <StateBadge state={runtime.data?.status} />
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
