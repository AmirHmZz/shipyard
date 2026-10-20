import { useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Confirm, StateBadge } from "@/components/shared";
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
import { errorMessage, number, text, type Resource } from "@/lib/api";

import { applicationKeys } from "../generics";
import { useDomainStatus } from "../hooks";
import { syncRoute } from "../services";

export function RouteCard({
  route,
  onEdit,
  onDelete,
}: {
  route: Resource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const q = useDomainStatus(route);
  const client = useQueryClient();
  const [replace, setReplace] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sync = async (mode: string) => {
    setSyncing(true);
    try {
      await syncRoute(route.id, { mode });
      toast.success("Domain reconciliation queued");
      void client.invalidateQueries({
        queryKey: applicationKeys.domain(route.id),
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {text(route.data, "protocol") === "grpc"
                ? "gRPC"
                : text(route.data, "protocol") === "tcp"
                  ? "TCP"
                  : "HTTPS"}
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
                  onClick={() => void sync("")}
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
                  onClick={onEdit}
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
              onClick={onDelete}
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
              onClick={() => void sync("adopt")}
            >
              Adopt matching records
            </Button>
            <Button
              disabled={syncing}
              variant="destructive"
              size="sm"
              onClick={() => setReplace(true)}
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
        onConfirm={() => sync("replace")}
      />
    </Card>
  );
}
