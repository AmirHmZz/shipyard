import { api } from "@/lib/api/client";
import type { State } from "../generics";

export async function getDashboardAccess() {
  return api<State>("/settings/dashboard-access");
}
