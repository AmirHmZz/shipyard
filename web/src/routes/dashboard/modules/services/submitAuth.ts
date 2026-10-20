import type * as z from "zod/mini";

import type { Session } from "@/lib/api/types";

import { post } from "@/lib/api/client";

import type { authFormSchema } from "../generics";

export function submitAuth(
  mode: "accept" | "login" | "setup",
  payload: z.output<ReturnType<typeof authFormSchema>>,
) {
  return post<Session>(`/auth/${mode}`, payload);
}
