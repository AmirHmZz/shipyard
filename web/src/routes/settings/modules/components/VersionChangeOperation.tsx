import type { Status } from "../generics";
import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Download } from "lucide-react";

export function VersionChangeOperation({
  operation,
  active,
  busy,
  reconnecting,
  version,
  download,
}: {
  operation: NonNullable<Status["operation"]>;
  active: boolean;
  busy: boolean;
  reconnecting: boolean;
  version: string;
  download: () => Promise<void>;
}) {
  return (
    <section className="space-y-3 border-t pt-5">
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
          variant="outline"
          onClick={() => void download()}
          disabled={busy || active}
        >
          <Download />
          Download encrypted backup
        </Button>
      )}
      {operation.state === "succeeded" &&
        version !== operation.plan.target.version && (
          <Button onClick={() => location.reload()}>Reload dashboard</Button>
        )}
    </section>
  );
}
