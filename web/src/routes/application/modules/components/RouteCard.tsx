import { Pencil, RefreshCw, Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

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

export type RouteCardProps = { route: Resource };
export function RouteCard({ route }: RouteCardProps) {
  const { state, derived, handlers } = useRouteCard(route);
  const { replace } = state;
  const { q, syncing, protocol } = derived;
  const {
    retrySync,
    adoptRecords,
    replaceRecords,
    confirmReplacement,
    setReplace,
  } = handlers;
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {protocol}
            </Badge>
            <span className="break-all font-medium">
              {text(route.data, "domain") ||
                `TCP :${number(route.data, "listenPort")}`}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              → {text(route.data, "service", "app")}:
              {number(route.data, "targetPort")}
            </span>
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
                  {syncing ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
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
                  <Pencil className="size-4" />
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
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-4">
          {["dns", "propagation", "certificate", "routing"].map((key) => (
            <div key={key}>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {key}
              </p>
              <StateBadge state={q.data?.[key] || "pending"} />
            </div>
          ))}
        </div>
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
            <Button
              disabled={syncing}
              variant="destructive"
              size="sm"
              onClick={replaceRecords}
            >
              Replace conflicting records
            </Button>
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
