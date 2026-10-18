import { post } from "@/lib/api/client";
import type { Session } from "@/lib/api/types";
import type { authFormSchema } from "@/lib/validation";

export function submitAuth(
  mode: "accept" | "login" | "setup",
  payload: ReturnType<typeof authFormSchema>["_output"],
) {
  return post<Session>(`/auth/${mode}`, payload);
}
