import { ProviderLogo, ProviderName } from "@/components/provider-name";
import { useResourceForm } from "@/components/resource-forms/controller";
import type { ResourceFieldProps } from "../types";
import { choose } from "../utils";

export function ResourceFieldSelect(props: ResourceFieldProps) {
  const { resources, f } = props;
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (f.options)
    return choose(
      String(data[f.key] || ""),
      (v) => update(f.key, v),
      f.options.map((v) => ({
        value: v,
        label:
          f.key === "protocol" ? (
            {
              https: "HTTPS",
              grpc: "gRPC",
              tcp: "TCP",
            }[v] || v
          ) : f.key === "tls" ? (
            v === "terminate" ? (
              "TLS termination"
            ) : (
              "TLS passthrough"
            )
          ) : f.key === "source" ? (
            v === "compose" ? (
              "Direct Compose"
            ) : (
              "Git repository"
            )
          ) : f.key === "authMethod" ? (
            v === "private_key" ? (
              "Private key (recommended)"
            ) : (
              "Password"
            )
          ) : f.key === "provider" ? (
            <ProviderName provider={v} />
          ) : (
            v
          ),
      })),
      `Select ${f.label}`,
      false,
      `${formId}-${f.key}`,
    );
  if (f.resource)
    return choose(
      String(data[f.key] || ""),
      (v) => update(f.key, v),
      resources
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
        })),
      `Select ${f.resource}`,
      false,
      `${formId}-${f.key}`,
    );
  return null;
}
