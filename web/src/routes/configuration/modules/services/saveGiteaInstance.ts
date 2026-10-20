import type { giteaInstanceSchema } from "@/lib/validation";

import { api } from "@/lib/api/client";

import type { Instance } from "../generics";

export function saveGiteaInstance(payload: typeof giteaInstanceSchema._output) {
  return api<Instance>("/git/gitea/instances", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
