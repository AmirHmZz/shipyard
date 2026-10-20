import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { GitWebhookSecretResult } from "../generics";

export function createGitWebhook(gitId: string) {
  return post<GitWebhookSecretResult>(apiPath`/git/${gitId}/webhook-secret`);
}
