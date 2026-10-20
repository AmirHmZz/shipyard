import type * as z from "zod/mini";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { composeSourceSchema } from "../generics";
import type { Source } from "../generics";

export function saveComposeSource(
  appId: string,
  payload: z.output<typeof composeSourceSchema>,
) {
  return api<Source>(apiPath`/applications/${appId}/compose`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
