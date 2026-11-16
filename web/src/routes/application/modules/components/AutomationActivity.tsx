import { Activity } from "lucide-react";

import { SettingsSection } from "@/components/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import type { AutomationStatus } from "../generics/automation";

export type AutomationActivityProps = { status: AutomationStatus };

export function AutomationActivity({ status }: AutomationActivityProps) {
  const enabledRules = status.rules.filter((rule) => rule.enabled);
  if (
    !status.lastResult &&
    !status.lastError &&
    !status.restartStatus.length &&
    !enabledRules.length
  )
    return null;
  return (
    <SettingsSection
      title="Activity & upcoming runs"
      description="Runtime status from your saved automation settings."
      icon={<Activity />}
    >
      <div className="flex flex-col gap-4 p-5">
        {status.lastError && (
          <Alert variant="destructive">
            <AlertDescription>{status.lastError}</AlertDescription>
          </Alert>
        )}
        {status.lastResult && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Last application action
              </p>
              <p className="text-sm font-medium capitalize">
                {status.lastAction} · {status.lastResult}
              </p>
            </div>
            {status.lastAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(status.lastAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {status.restartStatus.map((item) => (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-4"
              key={`${item.service}:${item.container}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-all font-mono text-sm font-medium">
                  {item.service}
                </p>
                <Badge variant="secondary">{item.state}</Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {item.container.slice(0, 12)}
              </p>
              {item.nextDue && (
                <p className="text-xs text-muted-foreground">
                  Next restart: {new Date(item.nextDue).toLocaleString()}
                </p>
              )}
            </div>
          ))}
          {enabledRules.map((rule) => (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-lg border p-4"
              key={rule.id}
            >
              <p className="text-sm font-medium capitalize">
                {rule.action} application
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {rule.cron} · {rule.timezone}
              </p>
              {(status.upcoming[rule.id] || []).map((at) => (
                <p key={at} className="text-xs text-muted-foreground">
                  Next:{" "}
                  {new Date(at).toLocaleString(undefined, {
                    timeZone: rule.timezone,
                    timeZoneName: "short",
                  })}
                </p>
              ))}
              {!status.upcoming[rule.id]?.length && (
                <p className="text-xs text-muted-foreground">
                  No upcoming runs reported.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}
