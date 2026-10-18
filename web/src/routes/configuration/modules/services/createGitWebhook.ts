import { post } from "@/lib/api/client";
import type { GitWebhookSecretResult } from "../generics";
import { apiPath } from "@/lib/paths";

export function createGitWebhook(gitId: string) {
  return post<GitWebhookSecretResult>(apiPath`/git/${gitId}/webhook-secret`);
}
