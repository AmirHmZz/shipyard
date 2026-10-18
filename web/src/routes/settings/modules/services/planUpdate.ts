import { post } from "@/lib/api/client";
import type { Plan } from "../generics";

export function planUpdate(payload: { target: string }) {
  return post<Plan>("/settings/updates/plan", payload);
}
