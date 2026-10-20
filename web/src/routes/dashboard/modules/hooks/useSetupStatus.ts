import { useApiQuery } from "@/lib/api/use-api-query";

import { dashboardKeys, setupStatusResponseSchema } from "../generics";

export function useSetupStatus() {
  return useApiQuery({
    queryKey: dashboardKeys.setup,
    path: "/auth/status",
    schema: setupStatusResponseSchema,
  });
}
