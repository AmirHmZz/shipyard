import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { downloadUpdateBackupResponseSchema, settingsKeys } from "../generics";
export function useDownloadUpdateBackup() {
  return useApiMutation({
    method: "GET",
    path: (id: string) => apiPath`/settings/updates/${id}/backup`,
    schema: downloadUpdateBackupResponseSchema,
    responseType: "blob",
    invalidate: [settingsKeys.systemUpdates],
  });
}
