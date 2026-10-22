import type { FormEvent } from "react";

import { useState } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import type { JobSettings } from "../generics/jobs";

import { jobPolicyFormSchema } from "../generics/jobs";
import { usePreviewJobSchedule } from "./usePreviewJobSchedule";
import { useSaveJobSettings } from "./useSaveJobSettings";
export function useJobScheduleForm(id: string, initial: JobSettings) {
  const [baseline, setBaseline] = useState(initial);
  const save = useSaveJobSettings(id);
  const [previewInput, setPreviewInput] = useState({ cron: "", timezone: "" });
  const preview = usePreviewJobSchedule(
    id,
    previewInput.cron,
    previewInput.timezone,
  );
  const timezone = baseline.version
    ? baseline.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = jobPolicyFormSchema.safeParse({
      ...Object.fromEntries(data),
      enabled: data.has("enabled"),
    });
    if (!result.success) {
      toastValidationError(result.error);
      return;
    }
    const submitter =
      event.nativeEvent instanceof SubmitEvent
        ? event.nativeEvent.submitter
        : null;
    if (
      submitter instanceof HTMLButtonElement &&
      submitter.value === "preview"
    ) {
      setPreviewInput({
        cron: result.data.cron,
        timezone: result.data.timezone,
      });
      return;
    }
    save.mutate({ ...baseline, ...result.data }, { onSuccess: setBaseline });
  }
  return { save, preview, timezone, submit };
}
