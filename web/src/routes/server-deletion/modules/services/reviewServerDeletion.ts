import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Plan } from "../generics";

export function reviewServerDeletion(id: string) {
  return post<Plan>(apiPath`/servers/${id}/deletion-plan`);
}
