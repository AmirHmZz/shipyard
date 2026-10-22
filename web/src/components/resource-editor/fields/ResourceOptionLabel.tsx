import { ProviderName } from "@/components/ProviderName";

const protocolLabels: Record<string, string> = {
  https: "HTTPS",
  grpc: "gRPC",
  tcp: "TCP",
};

export type ResourceOptionLabelProps = { field: string; value: string };
export function ResourceOptionLabel({
  field,
  value,
}: ResourceOptionLabelProps) {
  if (field === "protocol") return protocolLabels[value] || value;
  if (field === "tls")
    return value === "terminate" ? "TLS termination" : "TLS passthrough";
  if (field === "source")
    return value === "compose" ? "Direct Compose" : "Git repository";
  if (field === "readinessMode")
    return value === "container"
      ? "Container status"
      : "Additional readiness checks";
  if (field === "authMethod")
    return value === "private_key" ? "Private key (recommended)" : "Password";
  if (field === "provider") return <ProviderName provider={value} />;
  return value;
}
