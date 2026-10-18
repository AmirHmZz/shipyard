import { api } from "@/lib/api/client";
import type { Instance } from "../generics";
import type { giteaInstanceSchema } from "@/lib/validation";

export function saveGiteaInstance(payload: typeof giteaInstanceSchema._output) {
  return api<Instance>("/git/gitea/instances", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
