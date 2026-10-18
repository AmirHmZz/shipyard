import { post } from "@/lib/api/client";

export function setMaintenanceMode(enabled: boolean) {
  return post<unknown>("/settings/maintenance", { enabled });
}
