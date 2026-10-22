import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { GiteaInstanceValues } from "../generics";

import { giteaInstanceResponseSchema, configurationKeys } from "../generics";
export function useSaveGiteaInstance() {
  return useApiMutation({
    method: "PUT",
    path: "/git/gitea/instances",
    body: (instance: GiteaInstanceValues) => instance,
    schema: giteaInstanceResponseSchema,
    invalidate: [configurationKeys.giteaInstances],
  });
}
