import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Start } from "../generics";

export function reconnectGit(gitId: string) {
  return post<Start>(apiPath`/git/${gitId}/reconnect`);
}
