import type { MouseEvent } from "react";

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
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-rule={rule.id}
    >
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name={`enabled:${rule.id}`}
          defaultChecked={rule.enabled}
        />
        Enabled
      </label>
      <SelectControl
        name={`action:${rule.id}`}
        defaultValue={rule.action}
        options={[
          { value: "start", label: "Start application" },
          { value: "stop", label: "Stop application" },
        ]}
        triggerProps={{ "aria-label": "Scheduled action" }}
      />
      <InputField
        label="Cron expression"
        inputProps={{
          name: `cron:${rule.id}`,
          defaultValue: rule.cron,
          "aria-label": "Cron expression",
          required: true,
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" data-preview={rule.id} variant="outline">
          Preview schedule
        </Button>
        <Button
          type="button"
          data-rule={rule.id}
          variant="outline"
          onClick={remove}
        >
          Remove rule
        </Button>
      </div>
    </div>
  );
}
