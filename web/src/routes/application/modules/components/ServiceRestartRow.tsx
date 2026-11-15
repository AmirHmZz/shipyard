import type { MouseEvent } from "react";

import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";

export type ServiceRestartRowProps = {
  name: string;
  active: boolean;
  enabled: boolean;
  seconds: number;
  remove: (event: MouseEvent<HTMLButtonElement>) => void;
};
export function ServiceRestartRow({
  name,
  active,
  enabled,
  seconds,
  remove,
}: ServiceRestartRowProps) {
  let unit = "minutes",
    factor = 60;
  if (seconds && seconds % 86400 === 0) {
    unit = "days";
    factor = 86400;
  } else if (seconds && seconds % 3600 === 0) {
    unit = "hours";
    factor = 3600;
  }
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-service={name}
    >
      <p className="font-medium">
        {name}
        {!active && " · Inactive in current source"}
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name={`restart:${name}`}
          defaultChecked={enabled}
        />
        Restart periodically
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <InputField
          label="Interval"
          inputProps={{
            name: `interval:${name}`,
            type: "number",
            step: "any",
            min: 1 / 60,
            defaultValue: seconds ? seconds / factor : "",
            "aria-label": `${name} restart interval`,
          }}
        />
        <SelectControl
          name={`unit:${name}`}
          defaultValue={unit}
          options={["minutes", "hours", "days"]}
          triggerProps={{ "aria-label": `${name} interval unit` }}
        />
      </div>
      {!active && (
        <Button
          type="button"
          variant="outline"
          data-service={name}
          onClick={remove}
        >
          Remove inactive policy
        </Button>
      )}
    </div>
  );
}
