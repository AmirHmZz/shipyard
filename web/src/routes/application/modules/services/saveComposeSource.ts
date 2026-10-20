import type { composeSourceSchema } from "@/lib/validation";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Source } from "../generics";

export function saveComposeSource(
  appId: string,
  payload: typeof composeSourceSchema._output,
) {
  return api<Source>(apiPath`/applications/${appId}/compose`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
