import { api } from "@/lib/api/client";

import type { HistoryResponse } from "../generics";

// TODO(openapi): add history response to api/openapi.yaml.
export async function getHistory(type: "audit" | "jobs") {
  return api<HistoryResponse>(`/${type}`);
}
