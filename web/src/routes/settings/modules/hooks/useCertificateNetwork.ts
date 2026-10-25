import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { certificateNetworkSchema } from "@/lib/schemas/monitoring";
export function useCertificateNetwork() {
  return useApiQuery({
    queryKey: monitoringKeys.certificate,
    path: "/settings/certificates",
    schema: certificateNetworkSchema,
  });
}
