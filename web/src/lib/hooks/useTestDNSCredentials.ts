import type { DNSCredentials } from "@/lib/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";
export function useTestDNSCredentials() {
  return useApiMutation({
    method: "POST",
    path: "/dns/test",
    body: (credentials: DNSCredentials) => credentials,
    schema: okResponseSchema,
  });
}
