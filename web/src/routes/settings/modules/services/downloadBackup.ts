import type { passphraseSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

export function downloadBackup(payload: typeof passphraseSchema._output) {
  return post<Blob>("/backup", payload);
}
