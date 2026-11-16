import { CalendarClock, Plus, RotateCw, Save } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SettingsSection } from "@/components/SettingsSection";
import { ErrorState } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { AutomationSettings } from "../generics/automation";

import { useAutomationForm } from "../hooks/useAutomationForm";
import { AutomationRuleRow } from "./AutomationRuleRow";
import { ServiceRestartRow } from "./ServiceRestartRow";

export type AutomationFormProps = {
  app: Resource;
  initial: AutomationSettings;
  services: string[];
};
export function AutomationForm({
  app,
  initial,
  services,
}: AutomationFormProps) {
  const {
    baseline,
    stale,
    reload,
    names,
    rules,
    save,
    preview,
    previewTimezone,
    addRule,
    removeRule,
    removeRestart,
    submit,
  } = useAutomationForm(app.id, initial, services);
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset
        key={baseline.version}
        disabled={!app.canWrite || save.isPending}
        className="flex min-w-0 flex-col gap-6"
      >
        {stale && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
          >
            <p>
              Settings changed remotely. Your draft is preserved. Reload saved
              settings before saving.
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              Reload saved settings
            </Button>
          </div>
        )}
        <SettingsSection
          title="Periodic service restarts"
          description="Restart running replicas at a regular interval, measured from their last start. Stopped replicas stay stopped."
          icon={<RotateCw />}
          action={
            <Badge variant="secondary">
              {names.length} {names.length === 1 ? "service" : "services"}
            </Badge>
          }
        >
          <div className="divide-y">
            {!names.length && (
              <p className="p-6 text-sm text-muted-foreground">
                No services found. Add services to your application source to
                configure restarts.
              </p>
            )}
            {names.map((name) => (
              <ServiceRestartRow
                key={name}
                name={name}
                active={services.includes(name)}
                enabled={
                  baseline.restarts.find((p) => p.service === name)?.enabled ||
                  false
                }
                seconds={
                  baseline.restarts.find((p) => p.service === name)
                    ?.intervalSeconds || 0
                }
                remove={removeRestart}
              />
            ))}
          </div>
          <p className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
            Intervals must be between one minute and 365 days.
          </p>
        </SettingsSection>
        <SettingsSection
          title="Application start/stop schedule"
          description="Run your application when you need it with timezone-aware cron rules."
          icon={<CalendarClock />}
          action={
            <Button type="button" variant="outline" size="sm" onClick={addRule}>
              <Plus />
              Add schedule rule
            </Button>
          }
        >
          <div className="flex flex-col gap-4 p-5">
            {!rules.length && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/10 px-5 py-8 text-center">
                <CalendarClock className="mb-1 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No scheduled actions</p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Add a rule to start or stop this application automatically,
                  such as on weekday mornings.
                </p>
              </div>
            )}
            {rules.map((rule) => (
              <AutomationRuleRow
                key={rule.id}
                rule={rule}
                remove={removeRule}
              />
            ))}
          </div>
          <p className="border-t bg-muted/20 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
            Use five-field cron expressions and IANA timezones. After downtime,
            the latest missed action runs once. Stop wins simultaneous rules.
            Manual controls last until the next scheduled action.
          </p>
        </SettingsSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Saved automation takes effect immediately.
          </p>
          <Button type="submit">
            {save.isPending ? <Spinner /> : <Save />}Save automation
          </Button>
        </div>
      </fieldset>
      {preview.error && <ErrorState error={preview.error} />}
      {preview.data && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm"
        >
          <p className="font-medium">
            Upcoming occurrences ({previewTimezone})
          </p>
          {preview.data.upcoming.map((at) => (
            <p key={at} className="text-xs text-muted-foreground">
              {new Date(at).toLocaleString(undefined, {
                timeZone: previewTimezone,
                timeZoneName: "short",
              })}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}
