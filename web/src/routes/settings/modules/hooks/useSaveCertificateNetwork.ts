import { useApiMutation } from "@/lib/api/use-api-mutation";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { certificateNetworkSchema } from "@/lib/schemas/monitoring";
export function useSaveCertificateNetwork() {
  return useApiMutation({
    method: "PUT",
    path: "/settings/certificates",
    body: (proxyId: string) => ({ proxyId }),
    schema: certificateNetworkSchema,
    invalidate: [monitoringKeys.certificate],
    meta: { successMessage: "Certificate connection saved" },
  });
}
