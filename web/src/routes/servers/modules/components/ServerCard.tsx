import {
  Activity,
  Check,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  Trash2,
  Users,
} from "lucide-react";
import { lazy, Suspense } from "react";

import type { Resource } from "@/lib/api/types";

import { FlushCard } from "@/components/FlushCard";
import { IconButton } from "@/components/IconButton";
import { StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { text } from "@/lib/resource-fields";

import { useServerCard } from "../hooks";
import { ServerMetric } from "./ServerMetric";

const ServerCPUChart = lazy(() =>
  import("./ServerCPUChart").then((module) => ({
    default: module.ServerCPUChart,
  })),
);

export type ServerCardProps = { server: Resource };
export function ServerCard({ server }: ServerCardProps) {
  const { derived, handlers } = useServerCard(server);
  const { admin, q, latest, status, testing } = derived;
  const { testConnection } = handlers;
  const local = server.data.connection === "local";
  return (
    <FlushCard className="flex-1">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border bg-primary/5 text-primary">
            <Server className="size-5" />
          </div>
          <StateBadge state={status} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="break-all text-base font-semibold tracking-tight">
            {server.name}
          </h2>
          <p className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
            <Terminal className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-all font-mono">
              {local
                ? "Local Docker host"
                : `${text(server.data, "user")}@${text(server.data, "host")}`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5 font-normal">
            {local ? (
              <Server className="size-3" />
            ) : (
              <ShieldCheck className="size-3" />
            )}
            {local ? "Local connection" : "SSH connection"}
          </Badge>
        </div>
      </div>
      {server.data.deleting ? (
        <div className="flex flex-col gap-3 border-t p-5">
          <p className="break-words text-sm text-muted-foreground">
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
              {server.data.deletionError ? "Retry cleanup" : "Cleanup details"}
            </Button>
          )}
        </div>
      ) : (
        <>
          {admin && (
            <div className="flex flex-col gap-4 border-t p-5">
              <div className="grid grid-cols-3 gap-2">
                <ServerMetric label="CPU" value={latest?.cpu} icon={<Cpu />} />
                <ServerMetric
                  label="Memory"
                  value={latest?.memory}
                  icon={<MemoryStick />}
                />
                <ServerMetric
                  label="Disk"
                  value={latest?.disk}
                  icon={<HardDrive />}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5" />
                  CPU activity
                </span>
                <span>30s sampling</span>
              </div>
              {q.data && q.data.length > 1 ? (
                <div className="h-20">
                  <Suspense
                    fallback={
                      <div className="h-full animate-pulse rounded bg-muted" />
                    }
                  >
                    <ServerCPUChart data={q.data} />
                  </Suspense>
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed bg-muted/10 px-3 text-center text-xs text-muted-foreground">
                  Metrics appear after the next 30-second poll.
                </div>
              )}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3">
            <Button
              disabled={!server.canWrite}
              variant="outline"
              size="sm"
              data-server-id={server.id}
              data-action="edit"
            >
              <Settings2 />
              Configure
            </Button>
            <div className="flex items-center gap-1">
              <IconButton
                label="Team access"
                disabled={!server.canWrite}
                data-server-id={server.id}
                data-action="grants"
              >
                <Users />
              </IconButton>
              {server.canWrite && (
                <IconButton
                  label="HAProxy settings"
                  data-server-id={server.id}
                  data-action="haproxy"
                >
                  <ShieldCheck />
                </IconButton>
              )}
              <IconButton
                label="Test connection"
                disabled={!server.canWrite || testing}
                onClick={testConnection}
              >
                {testing ? <Spinner /> : <Check />}
              </IconButton>
              {admin && !local && (
                <IconButton
                  label="Delete server"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  data-server-id={server.id}
                  data-action="delete"
                >
                  <Trash2 />
                </IconButton>
              )}
            </div>
          </div>
        </>
      )}
    </FlushCard>
  );
}
