import { post } from "@/lib/api/client";

export function logout() {
  return post<unknown>("/auth/logout");
}
