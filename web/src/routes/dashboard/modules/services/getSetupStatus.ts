import { api } from "@/lib/api/client";

import type { SetupStatusResponse } from "../generics";

// TODO(openapi): add setup status response to api/openapi.yaml.
export async function getSetupStatus() {
  return api<SetupStatusResponse>("/auth/status");
}
