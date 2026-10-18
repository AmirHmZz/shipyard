import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function downloadUpdateBackup(operationId: string) {
  return api<Blob>(apiPath`/settings/updates/${operationId}/backup`);
}
