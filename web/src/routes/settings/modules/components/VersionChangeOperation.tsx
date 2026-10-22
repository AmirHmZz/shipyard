import { Download } from "lucide-react";

import { StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { Status } from "../generics";

export type VersionChangeOperationProps = {
  operation: NonNullable<Status["operation"]>;
  active: boolean;
  busy: boolean;
  reconnecting: boolean;
  version: string;
  download: () => void;
};
export function VersionChangeOperation({
  operation,
  active,
  busy,
  reconnecting,
  version,
  download,
}: VersionChangeOperationProps) {
  function handleButtonClick() {
    return void download();
  }
  function handleButtonClick2() {
    return location.reload();
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">
          Version change to {operation.plan.target.version}
        </h3>
        <StateBadge state={operation.state} />
        {active && <Spinner className="size-4" />}
      </div>
      {reconnecting && active && (
        <p className="text-sm text-muted-foreground">
          The dashboard is restarting. Reconnecting automatically…
        </p>
      )}
      {operation.error && (
        <Alert variant="destructive">
          <AlertDescription>{operation.error}</AlertDescription>
        </Alert>
      )}
      {operation.state === "recovery_required" && (
        <p className="text-sm">
          Maintenance mode remains enabled. An administrator must inspect the
          updater journal on the server and recover using the encrypted backup.
        </p>
      )}
      {operation.backup && (
        <Button
          className="self-start"
          variant="outline"
          onClick={handleButtonClick}
          disabled={busy || active}
        >
          <Download />
          Download encrypted backup
        </Button>
      )}
      {operation.state === "succeeded" &&
        version !== operation.plan.target.version && (
          <Button className="self-start" onClick={handleButtonClick2}>
            Reload dashboard
          </Button>
        )}
    </section>
  );
}
