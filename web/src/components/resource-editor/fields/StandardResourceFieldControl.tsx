import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";

import type { ResourceFieldProps } from "../types";

import { ResourceFieldSelect } from "../fields/ResourceFieldSelect";
import { ScalarResourceField } from "../fields/ScalarResourceField";
import { SecretResourceField } from "../fields/SecretResourceField";

export type StandardResourceFieldControlProps = ResourceFieldProps;
export function StandardResourceFieldControl(
  props: StandardResourceFieldControlProps,
) {
  function handleSelectControlValueChange(v: string) {
    return update("service", v);
  }

  const { kind, services, f } = props;

  const {
    state: { data },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  if (f.type === "password" || f.type === "secret")
    return <SecretResourceField {...props} />;
  if (kind === "route" && f.key === "service")
    return (
      <SelectControl
        value={String(data.service || "") || undefined}
        onValueChange={handleSelectControlValueChange}
        options={(services.data || []).map((s) => ({
          value: s.name,
          label: s.name,
        }))}
        placeholder={
          services.isFetching ? "Loading services…" : "Select Compose service"
        }
        disabled={!services.data?.length}
        triggerProps={{
          id: `${formId}-${f.key}`,
          className: "w-full",
          "aria-label": services.isFetching
            ? "Loading services…"
            : "Select Compose service",
        }}
      />
    );
  if (f.options || f.resource) return <ResourceFieldSelect {...props} />;
  return <ScalarResourceField {...props} />;
}
