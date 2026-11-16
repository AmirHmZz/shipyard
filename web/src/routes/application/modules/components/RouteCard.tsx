import {
  ArrowRight,
  Globe2,
  Network,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SectionRow } from "@/components/SectionRow";
import { Confirm, StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { number, text } from "@/lib/resource-fields";

import { useRouteCard } from "../hooks";

export type RouteCardProps = { route: Resource; canReplaceDNSRecords: boolean };
const statusKeys = ["dns", "propagation", "certificate", "routing"] as const;
export function RouteCard({ route, canReplaceDNSRecords }: RouteCardProps) {
  const { state, derived, handlers } = useRouteCard(route);
  const { replace } = state;
  const { q, syncing, protocol, statusError } = derived;
  const {
    retrySync,
    adoptRecords,
    replaceRecords,
    confirmReplacement,
    setReplace,
    retryStatus,
  } = handlers;
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <SectionRow className="items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-primary/5 text-primary"
              aria-hidden="true"
            >
              {protocol === "TCP" ? (
                <Network className="size-5" />
              ) : (
                <Globe2 className="size-5" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all text-base font-semibold tracking-tight">
                  {text(route.data, "domain") ||
                    `TCP :${number(route.data, "listenPort")}`}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {protocol}
                </Badge>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <ArrowRight className="size-3.5 shrink-0" />{" "}
                <span className="break-all">
                  {text(route.data, "service", "app")}:
                  {number(route.data, "targetPort")}
                </span>
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={!route.canWrite || syncing}
                  variant="ghost"
                  size="icon"
                  aria-label="Retry sync"
                  onClick={retrySync}
                >
                  {syncing ? <Spinner className="size-4" /> : <RefreshCw />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry sync</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={!route.canWrite}
                  variant="ghost"
                  size="icon"
                  aria-label="Edit route"
                  data-route-id={route.id}
                  data-route-action="edit"
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit route</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete route"
              disabled={!route.canWrite}
              data-route-id={route.id}
              data-route-action="delete"
            >
              <Trash2 />
            </Button>
          </div>
        </SectionRow>
        {q.isPending && (
          <p role="status" className="mt-5 text-sm text-muted-foreground">
            Loading route status…
          </p>
        )}
        {statusError && (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>
              Could not refresh route status. {statusError}
              {q.data && <p>Showing the last known status.</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={retryStatus}
                disabled={q.isFetching}
              >
                Retry status
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {q.data && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {statusKeys.map((key) => (
              <div
                key={key}
                className="flex flex-col items-start gap-2 rounded-lg border bg-muted/20 px-3 py-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {key}
                </p>
                <StateBadge state={q.data?.[key] || "pending"} />
              </div>
            ))}
          </div>
        )}
        {q.data?.error && (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{q.data.error}</AlertDescription>
          </Alert>
        )}
        {route.canWrite && q.data?.dns === "conflict" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={syncing}
              variant="outline"
              size="sm"
              onClick={adoptRecords}
            >
              Adopt matching records
            </Button>
            {canReplaceDNSRecords && (
              <Button
                disabled={syncing}
                variant="destructive"
                size="sm"
                onClick={replaceRecords}
              >
                Replace conflicting records
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <Confirm
        open={replace}
        onOpenChange={setReplace}
        title="Replace conflicting DNS records?"
        description="Existing A, AAAA and CNAME records for this hostname will be replaced with records pointing at the deployment server."
        destructive
        pending={syncing}
        onConfirm={confirmReplacement}
      />
    </Card>
  );
}
