import { api, post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function getGrants(resourceId: string) {
  return api<string[]>(apiPath`/resources/${resourceId}/grants`);
}

export function setGrant(resourceId: string, teamId: string, granted: boolean) {
  return post<unknown>(apiPath`/resources/${resourceId}/grants`, {
    teamId,
    granted,
  });
}
