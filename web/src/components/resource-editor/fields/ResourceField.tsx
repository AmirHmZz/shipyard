import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useResourceForm } from "@/components/resource-forms/controller";
import type { ResourceFieldProps } from "../types";
import { ResourceFieldControl } from "../fields/ResourceFieldControl";
import { ResourceFieldActions } from "../fields/ResourceFieldActions";

export function ResourceField({
  kind,
  resources,
  existing,
  services,
  repos,
  branches,
  f,
}: ResourceFieldProps) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();

  return (
    <div key={f.key} className="space-y-2">
      {kind === "application" &&
        (
          {
            source: "Source",
            healthTimeout: "Readiness",
            previews: "Pull request previews",
            profiles: "Build and registry",
          } as Record<string, string>
        )[f.key] && (
          <h2 className="mt-8 border-t pt-6 text-lg font-semibold">
            {
              (
                {
                  source: "Source",
                  healthTimeout: "Readiness",
                  previews: "Pull request previews",
                  profiles: "Build and registry",
                } as Record<string, string>
              )[f.key]
            }
          </h2>
        )}
      {f.type === "switch" ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`${formId}-${f.key}`}>
            {kind === "application" && f.key === "file"
              ? data.engine === "compose"
                ? "Compose file"
                : "Dockerfile"
              : f.label}
          </Label>
          <Switch
            id={`${formId}-${f.key}`}
            checked={!!data[f.key]}
            onCheckedChange={(v) => update(f.key, v)}
          />
        </div>
      ) : (
        <>
          <Label htmlFor={`${formId}-${f.key}`}>
            {kind === "application" && f.key === "file"
              ? data.engine === "compose"
                ? "Compose file"
                : "Dockerfile"
              : f.label}
          </Label>
          <ResourceFieldControl
            kind={kind}
            resources={resources}
            existing={existing}
            services={services}
            repos={repos}
            branches={branches}
            f={f}
          />
        </>
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
