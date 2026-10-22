import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { GitSetupValues } from "../generics";

import { gitSetupStartResponseSchema } from "../generics";
export function useStartGitSetup() {
  return useApiMutation({
    method: "POST",
    path: "/git/setup/start",
    body: (values: GitSetupValues) => values,
    schema: gitSetupStartResponseSchema,
  });
}
