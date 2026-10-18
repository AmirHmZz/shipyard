import { post } from "@/lib/api/client";
import type { Start } from "../generics";
import { apiPath } from "@/lib/paths";

export function reconnectGit(gitId: string) {
  return post<Start>(apiPath`/git/${gitId}/reconnect`);
}
