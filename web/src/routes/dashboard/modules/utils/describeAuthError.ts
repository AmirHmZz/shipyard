import type { ApiException } from "@/lib/api/errors";

import { describeError } from "@/lib/api/translate-error";

export function describeAuthError(error: ApiException | null) {
  if (!error) return "";
  const failure = error.error;
  if (
    failure.kind === "http" &&
    (failure.status === 401 ||
      (failure.status === 403 && failure.path === "/auth/accept"))
  )
    return failure.message;
  return describeError(error);
}
