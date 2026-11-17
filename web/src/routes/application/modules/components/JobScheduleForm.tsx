import { CalendarClock, Eye, RotateCw, Save, Timer } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
import { SettingsHeading } from "@/components/SettingsHeading";
import { SettingsSection } from "@/components/SettingsSection";
import { ErrorState } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

import type { JobSettings } from "../generics/jobs";

import { useJobScheduleForm } from "../hooks/useJobScheduleForm";

export type JobScheduleFormProps = { app: Resource; initial: JobSettings };
export function JobScheduleForm({ app, initial }: JobScheduleFormProps) {
  const { save, preview, timezone, submit } = useJobScheduleForm(
    app.id,
    initial,
  );
  const occurrences = preview.data?.upcoming ?? initial.upcoming;
  const occurrenceTimezone =
    preview.data?.timezone || initial.timezone || timezone;
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
      <SettingsHeading
        title="Schedule and execution policy"
        description="Choose when this job runs and how each attempt is handled."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <fieldset
          disabled={!app.canWrite || save.isPending}
          className="flex min-w-0 flex-col gap-5"
        >
          <SettingsSection
            title="Run schedule"
            description="Use a five-field cron expression and an IANA timezone."
            icon={<CalendarClock />}
          >
            <div className="flex flex-col gap-5 p-5">
              <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
                <Checkbox
                  name="enabled"
                  defaultChecked={initial.enabled}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Enable schedule</span>
                  <span className="text-xs text-muted-foreground">
                    Run automatically at the configured times. Manual runs
                    remain available.
                  </span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Cron expression"
                  inputProps={{
                    name: "cron",
                    defaultValue: initial.cron,
                    placeholder: "0 2 * * *",
                    "aria-label": "Cron expression",
                    className: "font-mono",
                  }}
                />
                <InputField
                  label="Timezone"
                  inputProps={{
                    name: "timezone",
                    defaultValue: timezone,
                    required: true,
                    "aria-label": "Timezone",
                    placeholder: "Asia/Tehran",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5">
                  0 2 * * *
                </code>{" "}
                runs every day at 02:00 in the selected timezone.
              </p>
            </div>
            <div className="flex justify-end border-t bg-muted/10 px-5 py-3">
              <Button
                type="submit"
                name="action"
                value="preview"
                variant="outline"
                size="sm"
                disabled={preview.isFetching}
              >
                {preview.isFetching ? <Spinner /> : <Eye />}Preview schedule
              </Button>
            </div>
          </SettingsSection>
          <SettingsSection
            title="Execution policy"
            description="Limit execution time and retry failed attempts."
            icon={<Timer />}
          >
            <div className="flex flex-col gap-5 p-5">
              <InputField
                label="Timeout per attempt (seconds)"
                inputProps={{
                  name: "timeoutSeconds",
                  type: "number",
                  min: 60,
                  max: 86400,
                  defaultValue: initial.timeoutSeconds,
                  required: true,
                  "aria-label": "Timeout per attempt (seconds)",
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Additional retries"
                  inputProps={{
                    name: "retries",
                    type: "number",
                    min: 0,
                    max: 5,
                    defaultValue: initial.retries,
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
                    defaultValue: initial.retryDelaySeconds,
                    required: true,
                    "aria-label": "Retry delay (seconds)",
                  }}
                />
              </div>
            </div>
            <div className="flex items-start gap-2 border-t bg-muted/10 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
              <RotateCw className="mt-0.5 size-4 shrink-0" />
              <p>
                Retries repeat the task and may repeat its side effects. Only
                one run can be active; missed or overlapping schedules are
                skipped.
              </p>
            </div>
          </SettingsSection>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs text-muted-foreground">
              Settings apply to future runs immediately. Active runs retain
              their policy.
            </p>
            <Button type="submit" name="action" value="save">
              {save.isPending ? <Spinner /> : <Save />}Save job settings
            </Button>
          </div>
        </fieldset>
        <SettingsSection
          title="Upcoming occurrences"
          description="Preview the next run times before saving your schedule."
          icon={<CalendarClock />}
        >
          <div className="p-5" aria-live="polite">
            {preview.error && <ErrorState error={preview.error} />}
            {occurrences.length ? (
              <div className="flex flex-col gap-4">
                <p className="break-all text-xs text-muted-foreground">
                  {occurrenceTimezone} ·{" "}
                  {preview.data ? "Schedule preview" : "Saved schedule"}
                </p>
                <ol className="flex flex-col divide-y">
                  {occurrences.map((at, index) => (
                    <li
                      key={at}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-mono text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <time dateTime={at} className="text-sm">
                        {new Date(at).toLocaleString(undefined, {
                          timeZone: occurrenceTimezone,
                          timeZoneName: "short",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Previewing does not enable or save the schedule.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-7 text-center">
                <CalendarClock className="size-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">Check your next run times</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Enter a cron expression and timezone, then preview the
                  schedule.
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
      </div>
    </form>
  );
}
