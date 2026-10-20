import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Runtime } from "../generics";

export async function getApplicationRuntime(id: string) {
  return api<Runtime>(apiPath`/applications/${id}/runtime`);
}
