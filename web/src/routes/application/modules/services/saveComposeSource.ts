import { api } from "@/lib/api/client";
import type { Source } from "../generics";
import type { composeSourceSchema } from "@/lib/validation";
import { apiPath } from "@/lib/paths";

export function saveComposeSource(
  appId: string,
  payload: typeof composeSourceSchema._output,
) {
  return api<Source>(apiPath`/applications/${appId}/compose`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
