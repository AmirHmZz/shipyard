import type { ApiException } from "@/lib/api/errors";

import { describeError } from "@/lib/api/translate-error";

// Sign-in keeps the server's credential guidance in its existing inline alert.
export function describeAuthError(error: ApiException | null) {
  if (!error) return "";
  if (error.error.kind === "http" && error.error.status === 401)
    return error.error.message;
  return describeError(error);
}
