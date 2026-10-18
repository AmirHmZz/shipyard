import { post } from "@/lib/api/client";
import type { Plan } from "../generics";
import { apiPath } from "@/lib/paths";

export function reviewServerDeletion(id: string) {
  return post<Plan>(apiPath`/servers/${id}/deletion-plan`);
}
