import { post } from "@/lib/api/client";

export function checkForUpdates() {
  return post<unknown>("/settings/updates/check", {});
}
