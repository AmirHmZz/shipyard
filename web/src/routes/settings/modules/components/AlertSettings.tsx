import { InputField } from "@/components/InputField";
import { ErrorState, Loading } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

import { useAlertPolicyForm } from "../hooks";
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

export function AlertSettings() {
  const { state, derived, handlers } = useAlertPolicyForm();
  const { value } = state;
  const { query, busy } = derived;
  const { submitPolicy, changeField } = handlers;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!value) return <Loading />;
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
            <InputField
              key={f.key}
              label={<>{f.label}</>}
              labelProps={{ htmlFor: `alert-${f.key}` }}
              inputProps={{
                id: `alert-${f.key}`,
                type: "number",
                min: f.max === 100 ? 1 : 30,
                max: f.max,
                value: value[f.key],
                onChange: changeField,
                "data-alert-field": f.key,
                required: true,
              }}
            />
          ))}
          <Button disabled={busy}>
            {busy && <Spinner className="size-4 " />}Save alert policy
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
