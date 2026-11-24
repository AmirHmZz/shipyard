import type { Resource } from "@/lib/api/types";

import { ProviderLogo } from "@/components/ProviderName";
import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";

import type { ResourceFieldProps } from "../types";

import { ResourceOptionLabel } from "./ResourceOptionLabel";

export type ResourceFieldSelectProps = ResourceFieldProps;
export function ResourceFieldSelect(props: ResourceFieldSelectProps) {
  function handleSelectControlValueChange(v: string) {
    return update(f.key, v);
  }
  function handleSelectControlValueChange2(v: string) {
    return update(f.key, v === "__direct__" ? "" : v);
  }

  const { resources, f } = props;
  const dockerBuildProxy = f.key === "dockerBuildProxyId";
  const {
    state: { data, parent, project },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  const teamId = resources.find(
    (resource) => resource.id === (parent || project),
  )?.teamId;
  function availableResource(resource: Resource) {
    if (resource.kind !== f.resource) return false;
    if (
      dockerBuildProxy &&
      resource.secretKeys.some(
        (key) => key === "username" || key === "password",
      )
    )
      return false;
    if (resource.kind !== "git" || !resource.teamId) return true;
    return (
      resource.teamId === teamId &&
      (resource.data.status === "ready" ||
        resource.id === props.existing?.data.gitId)
    );
  }
  if (f.options)
    return (
      <SelectControl
        value={
          String(
            data[f.key] || (f.key === "composeMode" ? "repository" : ""),
          ) || (f.resource === "proxy" ? "__direct__" : undefined)
        }
        onValueChange={handleSelectControlValueChange}
        options={f.options.map((v) => ({
          value: v,
          label: <ResourceOptionLabel field={f.key} value={v} />,
        }))}
        placeholder={`Select ${f.label}`}
        disabled={false}
        triggerProps={{
          id: `${formId}-${f.key}`,
          className: "w-full",
          "aria-label": `Select ${f.label}`,
        }}
      />
    );
  if (f.resource)
    return (
      <SelectControl
        value={
          String(data[f.key] || "") ||
          (f.resource === "proxy" ? "__direct__" : undefined)
        }
        onValueChange={handleSelectControlValueChange2}
        options={[
          ...(f.resource === "proxy"
            ? [
                {
                  value: "__direct__",
                  label: dockerBuildProxy
                    ? "Use host defaults"
                    : "Direct connection",
                },
              ]
            : []),
          ...resources.filter(availableResource).map((r) => ({
            value: r.id,
            label:
              f.resource === "git" ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ProviderLogo provider={String(r.data.provider || "")} />
                  <span className="truncate">{r.name}</span>
                </span>
              ) : (
                r.name
              ),
          })),
        ]}
        placeholder={`Select ${f.resource}`}
        disabled={false}
        triggerProps={{
          id: `${formId}-${f.key}`,
          className: "w-full",
          "aria-label": `Select ${dockerBuildProxy ? f.label : f.resource}`,
        }}
      />
    );
  return null;
}
