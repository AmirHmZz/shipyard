import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { ConnectionRepairPayload } from "../generics";

export function useRepairServerConnection(serverId: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/servers/${serverId}/deletion/connection`,
    body: (connection: ConnectionRepairPayload) => connection,
    schema: okResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
