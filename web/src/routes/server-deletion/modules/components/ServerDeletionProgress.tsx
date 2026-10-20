import type { Dispatch, SetStateAction } from "react";

import { RefreshCw } from "lucide-react";

import type { Resource } from "@/lib/api";

import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { describeError } from "@/lib/api/translate-error";

import type { Status } from "../generics";

import { useRetryServerDeletion } from "../hooks";
import { RepairConnection } from "./RepairConnection";

export function ServerDeletionProgress({
  operation,
  busy: reviewing,
  setError,
  id,
  server,
  repair,
  setRepair,
}: {
  operation: Status;
  busy: boolean;
  setError: (value: string) => void;
  id: string;
  server?: Resource;
  repair: boolean;
  setRepair: Dispatch<SetStateAction<boolean>>;
}) {
  const retry = useRetryServerDeletion(id);
  const busy = reviewing || retry.isPending;
  function retryCleanup() {
    setError("");
    retry.mutate(undefined, {
      onError: (error) => setError(describeError(error)),
    });
  }
  return (
    <>
      <Card className="shadow-none">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium capitalize">{operation.stage}</p>
            <StateBadge
              state={
                operation.done ? "done" : operation.error ? "failed" : "queued"
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {operation.done
              ? "Host cleanup completed. The server and its applications have been removed. The audit trail is retained."
              : "The server stays registered until cleanup succeeds. Workloads on this server are being permanently removed."}
          </p>
          {operation.error && (
            <>
              <Alert variant="destructive">
                <AlertDescription>{operation.error}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy} onClick={retryCleanup}>
                  {busy ? <Spinner className="size-4" /> : <RefreshCw />}
                  Retry cleanup
                </Button>
                {server && (
                  <Button
                    variant="outline"
                    onClick={() => setRepair((current) => !current)}
                  >
                    Repair connection
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {repair && server && (
        <RepairConnection server={server} onSaved={() => setRepair(false)} />
      )}
    </>
  );
}
