import type { Session } from "@/lib/api/types";

import { api, APIError, setCSRF } from "@/lib/api/client";

export async function getSession() {
  try {
    const s = await api<Session>("/auth/me");
    setCSRF(s.csrf);
    return s;
  } catch (error) {
    if (error instanceof APIError && error.status === 401) {
      setCSRF("");
      return null;
    }
    throw error;
  }
}
