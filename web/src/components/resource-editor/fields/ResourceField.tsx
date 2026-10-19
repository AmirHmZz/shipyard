import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useResourceForm } from "@/components/resource-forms/controller";
import type { ResourceFieldProps } from "../types";
import { ResourceFieldControl } from "../fields/ResourceFieldControl";
import { ResourceFieldActions } from "../fields/ResourceFieldActions";

const sections: Record<string, string> = {
  source: "Source",
  readinessChecks: "Readiness",
  previews: "Pull request previews",
  profiles: "Build and registry",
};

function ResourceFieldInput(
  props: ResourceFieldProps & { label: string; formId: string },
) {
  const { f, label, formId } = props;
  if (f.type === "readiness" || f.type === "previewRouting")
    return (
      <div
        role="group"
        aria-labelledby={`${formId}-${f.key}-label`}
        className="space-y-2"
      >
        <p id={`${formId}-${f.key}-label`} className="text-sm font-medium">
          {label}
        </p>
        <ResourceFieldControl {...props} />
      </div>
    );
  return (
    <>
      <Label htmlFor={`${formId}-${f.key}`}>{label}</Label>
      <ResourceFieldControl {...props} />
    </>
  );
}

export function ResourceField(props: ResourceFieldProps) {
  const { kind, f, repos, branches } = props;
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  const section = kind === "application" ? sections[f.key] : undefined;
  const label =
    kind === "application" && f.key === "file"
      ? data.engine === "compose"
        ? "Compose file"
        : "Dockerfile"
      : f.label;
  return (
    <div className="space-y-2">
      {section && (
        <h2 className="mt-8 border-t pt-6 text-lg font-semibold">{section}</h2>
      )}
      {f.type === "switch" ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`${formId}-${f.key}`}>{label}</Label>
          <Switch
            id={`${formId}-${f.key}`}
            checked={!!data[f.key]}
            onCheckedChange={(v) => update(f.key, v)}
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
