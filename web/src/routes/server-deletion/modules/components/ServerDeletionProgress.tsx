import type { useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";

import { RefreshCw } from "lucide-react";

import type { Resource } from "@/lib/api";

import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { resourceKeys } from "@/lib/query-keys";

import type { Status } from "../generics";

import { retryServerDeletion } from "../services";
import { RepairConnection } from "./RepairConnection";

export function ServerDeletionProgress({
  operation,
  busy,
  setBusy,
  setError,
  id,
  status,
  server,
  repair,
  setRepair,
  client,
}: {
  operation: Status;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  id: string;
  status: { refetch: () => Promise<unknown> };
  server?: Resource;
  repair: boolean;
  setRepair: Dispatch<SetStateAction<boolean>>;
  client: ReturnType<typeof useQueryClient>;
}) {
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
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await retryServerDeletion(id);
                      await status.refetch();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
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
        <RepairConnection
          server={server}
          onSaved={() => {
            setRepair(false);
            void client.invalidateQueries({
              queryKey: resourceKeys.all,
            });
          }}
        />
      )}
    </>
  );
}
