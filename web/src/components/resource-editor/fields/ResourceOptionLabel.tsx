import { ProviderName } from "@/components/ProviderName";

const fieldLabels: Record<string, Record<string, string>> = {
  protocol: { https: "HTTPS", grpc: "gRPC", tcp: "TCP" },
  workload: { job: "Job" },
  tls: { terminate: "TLS termination" },
  source: { compose: "Direct Compose" },
  readinessMode: { container: "Container status" },
  authMethod: { private_key: "Private key (recommended)" },
};
const fieldFallbacks: Record<string, string> = {
  workload: "Service",
  tls: "TLS passthrough",
  source: "Git repository",
  readinessMode: "Additional readiness checks",
  authMethod: "Password",
};

export type ResourceOptionLabelProps = { field: string; value: string };
export function ResourceOptionLabel({
  field,
  value,
}: ResourceOptionLabelProps) {
  if (field === "provider") return <ProviderName provider={value} />;
  return fieldLabels[field]?.[value] || fieldFallbacks[field] || value;
}
