import { useApiMutation } from "@/lib/api/use-api-mutation";
import { probeServerFingerprintResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useProbeServerFingerprint() {
  return useApiMutation({
    method: "POST",
    path: "/servers/fingerprint",
    body: (data: Record<string, unknown>) => ({
      host: data.host,
      port: data.port || 22,
    }),
    schema: probeServerFingerprintResponseSchema,
  });
}
