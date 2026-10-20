import { Plus, Trash2 } from "lucide-react";

import type { HTTPReadinessCheck } from "@/lib/application-settings";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import { useReadinessFields } from "@/lib/hooks/useReadinessFields";
export type ReadinessFieldsProps = {
  value: HTTPReadinessCheck[];
  onChange: (checks: HTTPReadinessCheck[]) => void;
  dockerfile: boolean;
};
export function ReadinessFields({
  value,
  onChange,
  dockerfile,
}: ReadinessFieldsProps) {
  const { state, handlers } = useReadinessFields(value, onChange, dockerfile);
  const { rows } = state;
  const { changeField, removeRow, addRow } = handlers;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Checks run for every replica, including private services. Public routes
        are optional. Docker health checks also apply.
      </p>
      {rows.map((row) => (
        <div
          key={row.rowId}
          className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 rounded-lg border p-3"
        >
          <InputField
            className="space-y-1"
            label={<>Service</>}
            labelProps={{ htmlFor: `${row.rowId}-service` }}
            inputProps={{
              id: `${row.rowId}-service`,
              value: row.service,
              placeholder: dockerfile ? "app" : "Compose service",
              onChange: changeField,
              "data-readiness-id": row.rowId,
              "data-readiness-field": "service",
            }}
          />
          <InputField
            className="space-y-1"
            label={<>Port</>}
            labelProps={{ htmlFor: `${row.rowId}-port` }}
            inputProps={{
              id: `${row.rowId}-port`,
              type: "number",
              min: 1,
              max: 65535,
              value: row.port || "",
              onChange: changeField,
              "data-readiness-id": row.rowId,
              "data-readiness-field": "port",
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="self-end"
            aria-label="Remove readiness check"
            onClick={removeRow}
            data-readiness-id={row.rowId}
          >
            <Trash2 className="size-4" />
          </Button>
          <InputField
            className="col-span-3 space-y-1"
            label={<>HTTP path</>}
            labelProps={{ htmlFor: `${row.rowId}-path` }}
            inputProps={{
              id: `${row.rowId}-path`,
              value: row.path,
              placeholder: "/health",
              onChange: changeField,
              "data-readiness-id": row.rowId,
              "data-readiness-field": "path",
            }}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" />
        Add HTTP check
      </Button>
    </div>
  );
}
