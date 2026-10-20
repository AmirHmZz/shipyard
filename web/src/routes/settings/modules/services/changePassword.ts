import type * as z from "zod/mini";

import type { Session } from "@/lib/api/types";

import { post } from "@/lib/api/client";

import type { passwordFormSchema } from "../generics";

export function changePassword(payload: z.output<typeof passwordFormSchema>) {
  return post<Session>("/auth/password", payload);
}
