import { useResourceForm } from "@/components/resource-forms/controller";
import type { ResourceFieldProps } from "../types";
import { choose } from "../utils";
import { ResourceFieldSelect } from "../fields/ResourceFieldSelect";
import { SecretResourceField } from "../fields/SecretResourceField";
import { ScalarResourceField } from "../fields/ScalarResourceField";

export function StandardResourceFieldControl(props: ResourceFieldProps) {
  const { kind, services, f } = props;

  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (f.type === "password" || f.type === "secret")
    return <SecretResourceField {...props} />;
  if (kind === "route" && f.key === "service")
    return choose(
      String(data.service || ""),
      (v) => update("service", v),
      (services.data || []).map((s) => ({
        value: s.name,
        label: s.name,
      })),
      services.isFetching ? "Loading services…" : "Select Compose service",
      !services.data?.length,
      `${formId}-${f.key}`,
    );
  if (f.options || f.resource) return <ResourceFieldSelect {...props} />;
  return <ScalarResourceField {...props} />;
}
