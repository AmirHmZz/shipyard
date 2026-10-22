import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import type { JobSettings } from "../generics/jobs";

import { jobKeys, jobSettingsSchema } from "../generics/jobs";
export function useSaveJobSettings(id: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/applications/${id}/job-settings`,
    body: (settings: JobSettings) => settings,
    schema: jobSettingsSchema,
    invalidate: [jobKeys.all(id)],
    meta: { successMessage: "Job settings saved" },
  });
}
