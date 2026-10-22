import type { Resource } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
import { ErrorState } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import type { JobSettings } from "../generics/jobs";

import { useJobScheduleForm } from "../hooks/useJobScheduleForm";
export type JobScheduleFormProps = { app: Resource; initial: JobSettings };
export function JobScheduleForm({ app, initial }: JobScheduleFormProps) {
  const { save, preview, timezone, submit } = useJobScheduleForm(
    app.id,
    initial,
  );
  const p = initial;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule and execution policy</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
          <fieldset
            disabled={!app.canWrite || save.isPending}
            className="flex flex-col gap-4"
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={p?.enabled}
              />{" "}
              Enable schedule
            </label>
            <InputField
              label="Cron expression"
              inputProps={{
                name: "cron",
                defaultValue: p?.cron,
                placeholder: "0 2 * * *",
                "aria-label": "Cron expression",
              }}
            />
            <InputField
              label="Timezone"
              inputProps={{
                name: "timezone",
                defaultValue: timezone,
                required: true,
                "aria-label": "Timezone",
              }}
            />
            <InputField
              label="Timeout per attempt (seconds)"
              inputProps={{
                name: "timeoutSeconds",
                type: "number",
                min: 60,
                max: 86400,
                defaultValue: p?.timeoutSeconds,
                required: true,
                "aria-label": "Timeout per attempt (seconds)",
              }}
            />
            <InputField
              label="Additional retries"
              inputProps={{
                name: "retries",
                type: "number",
                min: 0,
                max: 5,
                defaultValue: p?.retries,
                required: true,
                "aria-label": "Additional retries",
              }}
            />
            <InputField
              label="Retry delay (seconds)"
              inputProps={{
                name: "retryDelaySeconds",
                type: "number",
                min: 1,
                max: 3600,
                defaultValue: p?.retryDelaySeconds,
                required: true,
                "aria-label": "Retry delay (seconds)",
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="action" value="save">
                Save job settings
              </Button>
              <Button
                type="submit"
                name="action"
                value="preview"
                variant="outline"
              >
                Preview schedule
              </Button>
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Settings apply to future runs immediately. Active runs retain their
            policy. Retries repeat the task and may repeat its side effects.
            Missed schedules are skipped.
          </p>
          {preview.error && <ErrorState error={preview.error} />}
          {!!preview.data?.upcoming.length && (
            <div className="text-sm">
              <p>Upcoming occurrences ({preview.data.timezone})</p>
              <ul className="list-inside list-disc">
                {preview.data.upcoming.map(function occurrence(at) {
                  return (
                    <li key={at}>
                      {new Date(at).toLocaleString(undefined, {
                        timeZone: preview.data?.timezone,
                      })}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
