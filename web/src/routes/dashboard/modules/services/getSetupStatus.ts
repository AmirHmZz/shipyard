import type { SetupStatusResponse } from "../generics";
import { api } from "@/lib/api/client";

// TODO(openapi): add setup status response to api/openapi.yaml.
export async function getSetupStatus() {
  return api<SetupStatusResponse>("/auth/status");
}
