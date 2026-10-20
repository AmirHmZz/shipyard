import type * as z from "zod/mini";

import { api } from "@/lib/api/client";

import type { giteaInstanceSchema } from "../generics";
import type { Instance } from "../generics";

export function saveGiteaInstance(
  payload: z.output<typeof giteaInstanceSchema>,
) {
  return api<Instance>("/git/gitea/instances", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
