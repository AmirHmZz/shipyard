import type { MouseEvent } from "react";

import { Box } from "lucide-react";

import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
      className="grid items-center gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]"
      data-service={name}
    >
      <div className="flex min-w-0 flex-col items-start gap-2">
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
            Remove inactive policy
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name={`restart:${name}`} defaultChecked={enabled} />
        Restart periodically
      </label>
      <div className="flex min-w-0 items-end gap-2">
        <InputField
          className="flex min-w-0 flex-1 flex-col gap-2"
          label="Interval"
          inputProps={{
            name: `interval:${name}`,
            type: "number",
            step: "any",
            min: 1 / 60,
            defaultValue: seconds ? seconds / factor : "",
            "aria-label": `${name} restart interval`,
            placeholder: "15",
          }}
        />
        <SelectControl
          name={`unit:${name}`}
          defaultValue={unit}
          options={["minutes", "hours", "days"]}
          triggerProps={{ "aria-label": `${name} interval unit` }}
        />
      </div>
    </div>
  );
}
