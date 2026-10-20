import type * as z from "zod/mini";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type {
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "../generics";

export function saveApplicationNetworking(
  appId: string,
  published: boolean,
  payload:
    | z.output<typeof networkingPayloadSchema>
    | z.output<typeof publishedPortsPayloadSchema>,
) {
  return api<unknown>(
    published
      ? apiPath`/applications/${appId}/published-ports`
      : apiPath`/applications/${appId}/networking`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}
