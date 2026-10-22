import { useResourceForm } from "@/components/resource-forms/controller";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { ResourceFieldProps as ResourceFieldPropsInput } from "../types";

import { ResourceFieldActions } from "../fields/ResourceFieldActions";
import { ResourceFieldInput } from "./ResourceFieldInput";

const sections: Record<string, string> = {
  source: "Source",
  readinessChecks: "Readiness",
  previews: "Pull request previews",
  profiles: "Build",
};

export type ResourceFieldProps = ResourceFieldPropsInput;

export function ResourceField(props: ResourceFieldProps) {
  function handleSwitchCheckedChange(v: boolean) {
    return update(f.key, v);
  }

  const { kind, f, repos, branches } = props;
  const {
    state: { data },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  const section = kind === "application" ? sections[f.key] : undefined;
  let label = f.label;
  if (kind === "application" && f.key === "file")
    label = data.engine === "compose" ? "Compose file" : "Dockerfile";
  return (
    <div className={cn("flex flex-col gap-2", section && "pt-3")}>
      {section && (
        <h2 className="border-t pt-6 text-lg font-semibold">{section}</h2>
      )}
      {f.type === "switch" ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`${formId}-${f.key}`}>{label}</Label>
          <Switch
            id={`${formId}-${f.key}`}
            checked={!!data[f.key]}
            onCheckedChange={handleSwitchCheckedChange}
          />
        </div>
      ) : (
        <ResourceFieldInput {...props} label={label} formId={formId} />
      )}
      {f.help && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {f.help}
        </p>
      )}
      <ResourceFieldActions
        kind={kind}
        f={f}
        repos={repos}
        branches={branches}
      />
    </div>
  );
}
