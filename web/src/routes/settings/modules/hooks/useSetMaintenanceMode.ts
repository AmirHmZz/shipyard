import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";

import { maintenanceResponseSchema } from "../generics";
export function useSetMaintenanceMode() {
  return useApiMutation({
    method: "POST",
    path: "/settings/maintenance",
    body: (enabled: boolean) => ({ enabled }),
    schema: maintenanceResponseSchema,
    invalidate: [sessionKeys.all],
  });
}
