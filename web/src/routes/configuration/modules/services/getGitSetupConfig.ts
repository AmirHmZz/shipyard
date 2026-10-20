import { api } from "@/lib/api/client";

import type { GitSetupConfigResponse } from "../generics";

// TODO(openapi): add Git setup config response to api/openapi.yaml.
export async function getGitSetupConfig() {
  return api<GitSetupConfigResponse>("/git/setup/config");
}
