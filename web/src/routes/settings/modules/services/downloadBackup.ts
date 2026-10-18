import { post } from "@/lib/api/client";
import type { passphraseSchema } from "@/lib/validation";

export function downloadBackup(payload: typeof passphraseSchema._output) {
  return post<Blob>("/backup", payload);
}
