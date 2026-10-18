import { api } from "@/lib/api/client";

export function saveDashboardAccess(
  retry: boolean,
  payload: {
    version: number;
    domain?: string;
    acmeEmail?: string;
    acceptTos?: boolean;
  },
) {
  return api<unknown>("/settings/dashboard-access" + (retry ? "/retry" : ""), {
    method: retry ? "POST" : "PUT",
    body: JSON.stringify(payload),
  });
}
