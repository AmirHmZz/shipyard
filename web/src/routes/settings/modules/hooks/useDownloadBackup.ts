import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { PassphraseValues } from "../generics";

import { downloadBackupResponseSchema } from "../generics";
export function useDownloadBackup() {
  return useApiMutation({
    method: "POST",
    path: "/backup",
    body: (values: PassphraseValues) => values,
    schema: downloadBackupResponseSchema,
    responseType: "blob",
    meta: { successMessage: "Encrypted backup downloaded" },
  });
}
