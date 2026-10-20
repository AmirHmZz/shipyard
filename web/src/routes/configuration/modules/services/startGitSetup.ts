import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { gitSetupSchema } from "../generics";
import type { Start } from "../generics";

export function startGitSetup(payload: z.output<typeof gitSetupSchema>) {
  return post<Start>("/git/setup/start", payload);
}
