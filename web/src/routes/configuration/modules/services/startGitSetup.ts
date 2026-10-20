import type { gitSetupSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

import type { Start } from "../generics";

export function startGitSetup(payload: typeof gitSetupSchema._output) {
  return post<Start>("/git/setup/start", payload);
}
