import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Status } from "../generics";

export async function getServerDeletionStatus(id: string) {
  return api<Status>(apiPath`/servers/${id}/deletion`);
}
