import { sessionResponseSchema } from "@/lib/schemas/session";

import type { ApiError } from "./errors";

export function captureSessionFailure(path: string, error: ApiError) {
  if (path !== "/auth/me" || error.kind !== "http" || error.status !== 401)
    return false;
  setCSRF("");
  return true;
}

let csrf = "";
export function getCSRF() {
  return csrf;
}
export function setCSRF(value: string) {
  csrf = value;
}

export function captureSession(path: string, value: unknown) {
  if (path === "/auth/logout") {
    setCSRF("");
    return;
  }
  if (
    ![
      "/auth/me",
      "/auth/login",
      "/auth/setup",
      "/auth/accept",
      "/auth/password",
    ].includes(path)
  )
    return;
  const session = sessionResponseSchema.safeParse(value);
  if (session.success) setCSRF(session.data.csrf);
}
