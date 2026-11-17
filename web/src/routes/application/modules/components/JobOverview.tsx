import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  Layers,
  Timer,
} from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";

import { DetailItem } from "@/components/DetailItem";
import { SettingsHeading } from "@/components/SettingsHeading";
import { SettingsSection } from "@/components/SettingsSection";
import { ErrorState, Loading, StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const last = runs.data?.items.find((run) => !activeJobRun(run));
  const policy = settings.data;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading
        title="Job overview"
        description="Prepare a release, then execute it on demand or on a schedule."
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SettingsSection
          title="Execution"
          description="Current activity and the latest completed run."
          icon={<Activity />}
          action={<StateBadge state={active?.state || "idle"} />}
        >
          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            <DetailItem label="Active run">
              {active ? (
                <code className="text-xs">{active.id}</code>
              ) : (
                "No active run"
              )}
            </DetailItem>
            <DetailItem label="Last result">
              <StateBadge state={last?.state || "not_run"} />
            </DetailItem>
            <DetailItem label="Last started">
              {last ? new Date(last.createdAt).toLocaleString() : "No runs yet"}
            </DetailItem>
            <DetailItem label="Trigger">{last?.trigger || "—"}</DetailItem>
          </dl>
          {active?.error && (
            <p
              role="alert"
              className="mx-5 mb-5 break-words text-sm text-destructive"
            >
              {active.error}
            </p>
          )}
          <div className="flex justify-end border-t bg-muted/10 px-5 py-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="?tab=runs">
                View runs
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </SettingsSection>
        <SettingsSection
          title="Schedule"
          description="When the next automatic execution is due."
          icon={<CalendarClock />}
          action={
            <Badge variant={policy?.enabled ? "secondary" : "outline"}>
              {policy?.enabled ? "Enabled" : "Manual only"}
            </Badge>
          }
        >
          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            <DetailItem label="Cron expression">
              <code>{policy?.cron || "Not configured"}</code>
            </DetailItem>
            <DetailItem label="Timezone">{policy?.timezone || "—"}</DetailItem>
            <div className="sm:col-span-2">
              <DetailItem label="Next occurrence">
                {policy?.enabled && policy.nextDue
                  ? new Date(policy.nextDue).toLocaleString()
                  : "Disabled · manual runs available"}
              </DetailItem>
            </div>
          </dl>
          <div className="flex justify-end border-t bg-muted/10 px-5 py-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="?tab=schedule">
                Manage schedule
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </SettingsSection>
      </div>
      <SettingsSection
        title="Prepared release"
        description="Run now and Run again execute the latest deployed version."
        icon={<Layers />}
        action={
          <Badge variant="outline">
            {releaseId ? "Ready to run" : "Deployment required"}
          </Badge>
        }
      >
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl>
            <DetailItem label="Release ID">
              <code className="text-xs">
                {releaseId || "Deploy before running this Job"}
              </code>
            </DetailItem>
          </dl>
          <dl className="grid grid-cols-3 gap-4">
            <DetailItem label="Timeout">
              {policy?.timeoutSeconds ?? "—"}s
            </DetailItem>
            <DetailItem label="Retries">{policy?.retries ?? "—"}</DetailItem>
            <DetailItem label="Retry delay">
              {policy?.retryDelaySeconds ?? "—"}s
            </DetailItem>
          </dl>
        </div>
        <div className="flex items-start gap-2 border-t bg-muted/10 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <Timer className="mt-0.5 size-4 shrink-0" />
          <p>
            Deployment prepares a version without executing the task. Only one
            run can be active, including retry waits. Missed or overlapping
            scheduled runs are skipped.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
