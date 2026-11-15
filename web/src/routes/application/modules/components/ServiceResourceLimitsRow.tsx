import type { MouseEvent } from "react";

import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";

export type ServiceResourceLimitsRowProps = {
  name: string;
  active: boolean;
  cpus?: number;
  memoryBytes?: number;
  remove: (event: MouseEvent<HTMLButtonElement>) => void;
};
export function ServiceResourceLimitsRow({
  name,
  active,
  cpus,
  memoryBytes,
  remove,
}: ServiceResourceLimitsRowProps) {
  const gib = !!memoryBytes && memoryBytes % 1073741824 === 0;
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-service={name}
    >
      <p className="font-medium">
        {name}
        {!active && " · Inactive in current source"}
      </p>
      <InputField
        label="CPU limit (cores)"
        inputProps={{
          name: `cpu:${name}`,
          type: "number",
          min: 0.001,
          max: 1000000,
          step: "any",
          defaultValue: cpus ?? "",
          placeholder: "Use Compose/default",
          "aria-label": `${name} CPU limit`,
        }}
      />
      <div className="flex flex-wrap items-end gap-3">
        <InputField
          label="RAM limit"
          inputProps={{
            name: `memory:${name}`,
            type: "number",
            min: 0,
            step: "any",
            defaultValue: memoryBytes
              ? memoryBytes / (gib ? 1073741824 : 1048576)
              : "",
            placeholder: "Use Compose/default",
            "aria-label": `${name} RAM limit`,
          }}
        />
        <SelectControl
          name={`unit:${name}`}
          defaultValue={gib ? "GiB" : "MiB"}
          options={["MiB", "GiB"]}
          triggerProps={{ "aria-label": `${name} RAM unit` }}
        />
      </div>
      {!active && (
        <Button
          type="button"
          variant="outline"
          data-service={name}
          onClick={remove}
        >
          Remove inactive limits
        </Button>
      )}
    </div>
  );
}
