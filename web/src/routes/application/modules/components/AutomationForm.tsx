import type { Resource } from "@/lib/api/types";

import { ErrorState } from "@/components/Shared";
import { Button } from "@/components/ui/button";

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
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
      <fieldset
        key={baseline.version}
        disabled={!app.canWrite || save.isPending}
        className="flex flex-col gap-4"
      >
        {stale && (
          <div role="alert">
            <p>
              Settings changed remotely. Your draft is preserved. Reload saved
              settings before saving.
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              Reload saved settings
            </Button>
          </div>
        )}
        <h3 className="text-lg font-medium">Periodic service restarts</h3>
        <p className="text-sm text-muted-foreground">
          Intervals run from each replica’s last start. Stopped apps and
          replicas stay stopped. Minimum one minute; maximum 365 days.
        </p>
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
        <h3 className="text-lg font-medium">Application start/stop schedule</h3>
        <p className="text-sm text-muted-foreground">
          Use five-field cron expressions and IANA timezones. After downtime,
          the latest missed action is applied once. Stop wins simultaneous
          rules. Manual controls last until the next scheduled action.
        </p>
        {rules.map((rule) => (
          <AutomationRuleRow key={rule.id} rule={rule} remove={removeRule} />
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addRule}>
            Add schedule rule
          </Button>
          <Button type="submit">Save automation</Button>
        </div>
      </fieldset>
      {preview.error && <ErrorState error={preview.error} />}
      {preview.data && (
        <div role="status">
          <p>Upcoming occurrences ({previewTimezone})</p>
          {preview.data.upcoming.map((at) => (
            <p key={at}>
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
