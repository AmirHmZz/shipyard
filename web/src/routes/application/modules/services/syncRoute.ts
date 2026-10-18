import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function syncRoute(routeId: string, payload: { mode: string }) {
  return post<unknown>(apiPath`/routes/${routeId}/sync`, payload);
}
