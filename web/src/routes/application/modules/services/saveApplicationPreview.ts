import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function saveApplicationPreview(
  appId: string,
  payload: Pick<Resource, "kind" | "name" | "version" | "data">,
) {
  return api<unknown>(apiPath`/resources/${appId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
