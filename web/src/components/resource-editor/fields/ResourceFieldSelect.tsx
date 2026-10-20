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
    return update(f.key, v);
  }

  const { resources, f } = props;
  const {
    state: { data },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  if (f.options)
    return (
      <SelectControl
        value={String(data[f.key] || "") || undefined}
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
        value={String(data[f.key] || "") || undefined}
        onValueChange={handleSelectControlValueChange2}
        options={resources
          .filter((r) => r.kind === f.resource)
          .map((r) => ({
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
          }))}
        placeholder={`Select ${f.resource}`}
        disabled={false}
        triggerProps={{
          id: `${formId}-${f.key}`,
          className: "w-full",
          "aria-label": `Select ${f.resource}`,
        }}
      />
    );
  return null;
}
