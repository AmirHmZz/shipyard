import { Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type StateBadgeProps = { state?: string; className?: string };

export function StateBadge({ state, className }: StateBadgeProps) {
  const healthy = [
    "healthy",
    "ready",
    "running",
    "connected",
    "done",
    "online",
  ].includes(state || "");
  const failed = [
    "failed",
    "recovery_failed",
    "stop_failed",
    "conflict",
    "offline",
    "renewal_failed",
  ].includes(state || "");
  const pending = [
    "queued",
    "building",
    "deploying",
    "issuing",
    "pending",
    "stopping",
  ].includes(state || "");
  let appearance = "bg-muted/60 text-muted-foreground";
  if (failed)
    appearance = "border-destructive/20 bg-destructive/8 text-destructive";
  if (healthy) appearance = "border-primary/20 bg-primary/8 text-primary";
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal capitalize", appearance, className)}
    >
      {pending ? (
        <Spinner className="size-3" />
      ) : (
        <Circle
          className={`size-1.5 ${healthy || failed ? "fill-current" : ""}`}
        />
      )}{" "}
      {(state || "not deployed").replaceAll("_", " ")}
    </Badge>
  );
}
