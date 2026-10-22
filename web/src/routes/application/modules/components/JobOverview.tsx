import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading, StateBadge } from "@/components/Shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { activeJobRun } from "../generics/jobs";
import { useJobRuns } from "../hooks/useJobRuns";
import { useJobSettings } from "../hooks/useJobSettings";
export type JobOverviewProps = { app: Resource; releaseId?: string };
export function JobOverview({ app, releaseId }: JobOverviewProps) {
  const settings = useJobSettings(app.id);
  const runs = useJobRuns(app.id);
  if (settings.isPending || runs.isPending) return <Loading />;
  if (settings.error || runs.error)
    return <ErrorState error={settings.error || runs.error} />;
  const active = runs.data?.activeRun;
  const last = runs.data?.items.find(function completed(run) {
    return !activeJobRun(run);
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          Deployment prepares a version without executing the task. Run now and
          Run again use the latest deployed version.
        </p>
        <p>
          Prepared release:{" "}
          <code>{releaseId || "Deploy before running this Job"}</code>
        </p>
        <p>
          Schedule:{" "}
          {settings.data?.enabled
            ? settings.data.cron + " · " + settings.data.timezone
            : "Disabled · manual runs available"}
        </p>
        <p>
          Next occurrence:{" "}
          {settings.data?.nextDue
            ? new Date(settings.data.nextDue).toLocaleString()
            : "—"}
        </p>
        <p>
          Active run: <StateBadge state={active?.state || "idle"} />
        </p>
        <p>
          Last result: <StateBadge state={last?.state || "not_run"} />
        </p>
        {active?.error && <p role="alert">{active.error}</p>}
        <p className="text-muted-foreground">
          Only one run can be active, including retry waits. Missed or
          overlapping scheduled runs are skipped.
        </p>
      </CardContent>
    </Card>
  );
}
