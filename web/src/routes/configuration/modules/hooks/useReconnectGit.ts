import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { gitSetupStartResponseSchema } from "../generics";
export function useReconnectGit(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/git/${id}/reconnect`,
    body: () => ({}),
    schema: gitSetupStartResponseSchema,
  });
}
