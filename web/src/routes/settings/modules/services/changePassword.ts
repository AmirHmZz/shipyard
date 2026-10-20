import type { Session } from "@/lib/api/types";
import type { passwordFormSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

export function changePassword(payload: typeof passwordFormSchema._output) {
  return post<Session>("/auth/password", payload);
}
