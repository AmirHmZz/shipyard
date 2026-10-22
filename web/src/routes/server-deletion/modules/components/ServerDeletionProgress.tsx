import { RefreshCw } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SectionRow } from "@/components/SectionRow";
import { StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

import type { Status } from "../generics";

import { RepairConnection } from "./RepairConnection";

export type ServerDeletionProgressProps = {
  operation: Status;
  busy: boolean;
  retryCleanup: () => void;
  server?: Resource;
  repair: boolean;
  setRepair: (value: boolean) => void;
};
export function ServerDeletionProgress({
  operation,
  busy,
  retryCleanup,
  server,
  repair,
  setRepair,
}: ServerDeletionProgressProps) {
  function handleButtonClick() {
    return setRepair(!repair);
  }
  function handleRepairConnectionSaved() {
    return setRepair(false);
  }

  let stage = "queued";
  if (operation.error) stage = "failed";
  if (operation.done) stage = "done";
  return (
    <>
      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-4 pt-6">
          <SectionRow>
            <p className="font-medium capitalize">{operation.stage}</p>
            <StateBadge state={stage} />
          </SectionRow>
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
                  <Button variant="outline" onClick={handleButtonClick}>
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
          onSaved={handleRepairConnectionSaved}
        />
      )}
    </>
  );
}
