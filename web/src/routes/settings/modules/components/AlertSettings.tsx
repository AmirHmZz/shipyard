import type { FormEvent } from "react";

import { useState } from "react";

import { ErrorState, Loading } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toastValidationError } from "@/lib/api/toaster";
import { inputNumberSchema } from "@/lib/schemas/coercion";

import type { AlertPolicy } from "../generics";

import { alertPolicySchema } from "../generics";
import { useAlertPolicy, useSaveAlertPolicy } from "../hooks";

export function AlertSettings() {
  const query = useAlertPolicy();
  const save = useSaveAlertPolicy();
  const [draft, setDraft] = useState<AlertPolicy | null>(null);
  const busy = save.isPending;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return <Loading />;
  const value = draft || query.data;
  function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = alertPolicySchema.safeParse(value);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => setDraft(null) });
  }
  const fields = [
    { key: "cpu", label: "CPU threshold (%)", max: 100 },
    { key: "memory", label: "Memory threshold (%)", max: 100 },
    { key: "disk", label: "Disk threshold (%)", max: 100 },
    {
      key: "sustainedSeconds",
      label: "Resource threshold duration (seconds)",
      max: 86400,
    },
    { key: "offlineSeconds", label: "Offline duration (seconds)", max: 86400 },
  ] as const;
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle>Alert policy</CardTitle>
        <CardDescription>
          Notify configured webhook integrations when a condition persists. A
          recovery event follows when it clears. Metrics are sampled every 30
          seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submitPolicy}>
          {fields.map((f) => (
            <div className="space-y-2" key={f.key}>
              <Label htmlFor={`alert-${f.key}`}>{f.label}</Label>
              <Input
                id={`alert-${f.key}`}
                type="number"
                min={f.max === 100 ? 1 : 30}
                max={f.max}
                value={value[f.key]}
                onChange={(e) =>
                  setDraft({
                    ...value,
                    [f.key]: inputNumberSchema.parse(e.target.value),
                  })
                }
                required
              />
            </div>
          ))}
          <Button disabled={busy}>
            {busy && <Spinner className="size-4 " />}Save alert policy
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
