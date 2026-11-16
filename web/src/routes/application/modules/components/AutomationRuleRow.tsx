import type { MouseEvent } from "react";

import { Eye, Trash2 } from "lucide-react";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";

import type { AutomationRule } from "../generics/automation";

export type AutomationRuleRowProps = {
  rule: AutomationRule;
  remove: (event: MouseEvent<HTMLButtonElement>) => void;
};
export function AutomationRuleRow({ rule, remove }: AutomationRuleRowProps) {
  return (
    <div
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-background/40 p-4"
      data-rule={rule.id}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name={`enabled:${rule.id}`}
            defaultChecked={rule.enabled}
            className="size-4 accent-primary"
          />
          Enabled
        </label>
        <Button
          type="button"
          data-rule={rule.id}
          variant="ghost"
          size="icon-sm"
          aria-label="Remove rule"
          onClick={remove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <FormField label="Action" labelProps={{ htmlFor: `action:${rule.id}` }}>
          <SelectControl
            name={`action:${rule.id}`}
            defaultValue={rule.action}
            options={[
              { value: "start", label: "Start application" },
              { value: "stop", label: "Stop application" },
            ]}
            triggerProps={{
              id: `action:${rule.id}`,
              "aria-label": "Scheduled action",
              className: "w-full",
            }}
          />
        </FormField>
        <InputField
          label="Cron expression"
          inputProps={{
            name: `cron:${rule.id}`,
            defaultValue: rule.cron,
            "aria-label": "Cron expression",
            required: true,
            className: "font-mono text-xs",
          }}
        />
        <InputField
          label="Timezone"
          inputProps={{
            name: `timezone:${rule.id}`,
            defaultValue: rule.timezone,
            "aria-label": "Timezone",
            required: true,
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          data-preview={rule.id}
          variant="outline"
          size="sm"
        >
          <Eye />
          Preview schedule
        </Button>
      </div>
    </div>
  );
}
