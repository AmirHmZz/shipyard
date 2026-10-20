import type { dnsCredentialSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

// TODO(openapi): add the option response shapes to the generated schema.

export function testDNSCredentials(
  credentials: typeof dnsCredentialSchema._output,
) {
  return post<unknown>("/dns/test", credentials);
}

// TODO(openapi): add the fingerprint probe response to the generated schema.

export function probeServerFingerprint(data: Record<string, unknown>) {
  return post<{ fingerprint: string }>("/servers/fingerprint", {
    host: data.host,
    port: data.port || 22,
  });
}
