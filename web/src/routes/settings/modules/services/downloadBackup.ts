import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { passphraseSchema } from "../generics";

export function downloadBackup(payload: z.output<typeof passphraseSchema>) {
  return post<Blob>("/backup", payload);
}
