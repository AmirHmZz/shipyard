import type { MouseEvent } from "react";

import { Box } from "lucide-react";

import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Badge } from "@/components/ui/badge";
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
      className="grid items-start gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]"
      data-service={name}
    >
      <div className="flex min-w-0 flex-col items-start gap-2 md:pt-7">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Box className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-all font-mono">{name}</span>
        </p>
        {!active && <Badge variant="outline">Inactive in current source</Badge>}
        {!active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-service={name}
            onClick={remove}
          >
            Remove inactive limits
          </Button>
        )}
      </div>
      <InputField
        label="CPU limit (cores)"
        inputProps={{
          name: `cpu:${name}`,
          type: "number",
          min: 0.001,
          max: 1000000,
          step: "any",
          defaultValue: cpus ?? "",
          placeholder: "Compose/default",
          "aria-label": `${name} CPU limit`,
        }}
      />
      <div className="flex min-w-0 items-end gap-2">
        <InputField
          className="flex min-w-0 flex-1 flex-col gap-2"
          label="RAM limit"
          inputProps={{
            name: `memory:${name}`,
            type: "number",
            min: 0,
            step: "any",
            defaultValue: memoryBytes
              ? memoryBytes / (gib ? 1073741824 : 1048576)
              : "",
            placeholder: "Compose/default",
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
    </div>
  );
}
