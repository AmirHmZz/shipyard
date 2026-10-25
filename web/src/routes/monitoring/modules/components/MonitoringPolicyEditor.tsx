import type { FormEvent, ChangeEvent } from "react";

import { useState } from "react";

import type { Resource } from "@/lib/api/types";
import type { MonitoringPolicyState } from "@/lib/schemas/monitoring";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toastValidationError } from "@/lib/api/toaster";
import { monitoringPolicyStateSchema } from "@/lib/schemas/monitoring";

const fields = [
  { key: "cpu", label: "CPU threshold (%)" },
  { key: "memory", label: "Memory threshold (% of host RAM)" },
  { key: "disk", label: "Docker storage threshold (%)" },
  { key: "sustainedSeconds", label: "Resource duration (seconds)" },
  { key: "offlineSeconds", label: "Availability duration (seconds)" },
] as const;
export type MonitoringPolicyEditorProps = {
  title: string;
  kind: string;
  value: MonitoringPolicyState;
  destinations: Resource[];
  pending: boolean;
  defaults?: boolean;
  onSave: (value: MonitoringPolicyState) => void;
};
export function MonitoringPolicyEditor({
  title,
  kind,
  value,
  destinations,
  pending,
  defaults = false,
  onSave,
}: MonitoringPolicyEditorProps) {
  const [mode, setMode] = useState(value.mode);
  const editable = defaults || mode === "override";
  function changeMode(event: ChangeEvent<HTMLInputElement>) {
    const parsed = monitoringPolicyStateSchema.shape.mode.safeParse(
      event.currentTarget.value,
    );
    if (parsed.success) setMode(parsed.data);
  }
  function maximum(key: string) {
    if (key.endsWith("Seconds")) return 86400;
    if (key === "cpu" && kind === "application") return 100000;
    return 100;
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!defaults && mode !== "override") {
      onSave({ mode, policy: value.policy });
      return;
    }
    const form = new FormData(event.currentTarget);
    const parsed = monitoringPolicyStateSchema.safeParse({
      mode: defaults ? "override" : form.get("mode"),
      policy: {
        enabled: form.get("enabled") === "on",
        cpu: Number(form.get("cpu")),
        memory: Number(form.get("memory")),
        disk: kind === "server" ? Number(form.get("disk")) : value.policy.disk,
        sustainedSeconds: Number(form.get("sustainedSeconds")),
        offlineSeconds: Number(form.get("offlineSeconds")),
        destinations: form.getAll("destinations"),
      },
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    onSave(parsed.data);
  }
  return (
    <Card className="min-w-0 shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Choose destinations under Integrations. Resource usage must remain
          above a threshold for the configured duration. Network and disk I/O
          are chart-only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={submit}
          key={JSON.stringify(value)}
        >
          {!defaults && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium">Policy mode</legend>
              {["inherit", "override", "disabled"].map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    value={mode}
                    defaultChecked={value.mode === mode}
                    onChange={changeMode}
                  />
                  {mode}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset
            disabled={!editable}
            className="flex min-w-0 flex-col gap-5 disabled:opacity-60"
          >
            <Label className="flex gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={value.policy.enabled}
              />
              Enable alerts
            </Label>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields
                .filter((field) => kind === "server" || field.key !== "disk")
                .map((field) => (
                  <InputField
                    key={field.key}
                    label={<>{field.label}</>}
                    labelProps={{ htmlFor: `${title}-${field.key}` }}
                    inputProps={{
                      id: `${title}-${field.key}`,
                      name: field.key,
                      type: "number",
                      required: true,
                      defaultValue: value.policy[field.key],
                      min: field.key.endsWith("Seconds") ? 30 : 1,
                      max: maximum(field.key),
                    }}
                  />
                ))}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Notification destinations
              </legend>
              {destinations.length ? (
                destinations.map((destination) => (
                  <Label key={destination.id} className="flex gap-2">
                    <input
                      type="checkbox"
                      name="destinations"
                      value={destination.id}
                      defaultChecked={value.policy.destinations.includes(
                        destination.id,
                      )}
                    />
                    {destination.name}
                  </Label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add Telegram, Bale or a webhook in Integrations. No
                  destinations means incidents are recorded without delivery.
                </p>
              )}
            </fieldset>
          </fieldset>
          <Button disabled={pending} className="self-start">
            {pending ? "Saving…" : "Save policy"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
