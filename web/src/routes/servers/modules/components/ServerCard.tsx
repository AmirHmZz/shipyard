import { Check, Server, Settings2, Trash2, Users } from "lucide-react";
import { lazy, Suspense } from "react";

import type { Resource } from "@/lib/api/types";

import { StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { text } from "@/lib/resource-fields";

import { useServerCard } from "../hooks";

const ServerCPUChart = lazy(() =>
  import("./ServerCPUChart").then((module) => ({
    default: module.ServerCPUChart,
  })),
);

export type ServerCardProps = { server: Resource };
export function ServerCard({ server }: ServerCardProps) {
  const { derived, handlers } = useServerCard(server);
  const { admin, q, latest, status } = derived;
  const { testConnection } = handlers;
  return (
    <Card className="shadow-none">
      <CardHeader className="flex justify-between">
        <div>
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border bg-muted/50">
            <Server className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">{server.name}</CardTitle>
          <CardDescription className="mt-2 font-mono text-xs">
            {server.data.connection === "local"
              ? "Local Docker host"
              : `${text(server.data, "user")}@${text(server.data, "host")} · SSH`}
          </CardDescription>
        </div>
        <StateBadge state={status} />
      </CardHeader>
      <CardContent>
        {server.data.deleting ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {server.data.deletionError
                ? text(server.data, "deletionError")
                : "Server cleanup in progress."}
            </p>
            {admin && (
              <Button
                className="self-start"
                variant="outline"
                size="sm"
                data-server-id={server.id}
                data-action="delete"
              >
                {server.data.deletionError
                  ? "Retry cleanup"
                  : "Cleanup details"}
              </Button>
            )}
          </div>
        ) : (
          <>
            {admin && (
              <>
                <div className="mb-5 grid grid-cols-3 gap-3">
                  {[
                    ["CPU", latest?.cpu],
                    ["Memory", latest?.memory],
                    ["Disk", latest?.disk],
                  ].map(([label, v]) => (
                    <div key={label}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </p>
                      <p className="mt-2 font-mono text-lg">
                        {typeof v === "number" ? `${v.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
                {q.data && q.data.length > 1 ? (
                  <div className="mb-5 h-20">
                    <Suspense
                      fallback={
                        <div className="h-full animate-pulse rounded bg-muted" />
                      }
                    >
                      <ServerCPUChart data={q.data} />
                    </Suspense>
                  </div>
                ) : (
                  <p className="mb-5 text-xs text-muted-foreground">
                    Metrics appear after the next 30-second poll.
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                disabled={!server.canWrite}
                variant="outline"
                size="sm"
                data-server-id={server.id}
                data-action="edit"
              >
                Configure
              </Button>
              <Button
                disabled={!server.canWrite}
                variant="outline"
                size="sm"
                data-server-id={server.id}
                data-action="grants"
              >
                <Users />
                Team access
              </Button>
              {server.canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  data-server-id={server.id}
                  data-action="haproxy"
                >
                  <Settings2 /> HAProxy settings
                </Button>
              )}
              <Button
                disabled={!server.canWrite}
                variant="ghost"
                size="sm"
                onClick={testConnection}
              >
                <Check />
                Test
              </Button>
              {admin && server.data.connection !== "local" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  data-server-id={server.id}
                  data-action="delete"
                >
                  <Trash2 />
                  Delete server
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
