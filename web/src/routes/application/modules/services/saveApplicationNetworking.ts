import type {
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "@/lib/validation";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function saveApplicationNetworking(
  appId: string,
  published: boolean,
  payload:
    | typeof networkingPayloadSchema._output
    | typeof publishedPortsPayloadSchema._output,
) {
  return api<unknown>(
    published
      ? apiPath`/applications/${appId}/published-ports`
      : apiPath`/applications/${appId}/networking`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}
