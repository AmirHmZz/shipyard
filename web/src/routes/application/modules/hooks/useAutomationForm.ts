import type { FormEvent, MouseEvent } from "react";

import { useState } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import type {
  AutomationSettings,
  AutomationRule,
} from "../generics/automation";

import {
  automationSettingsSchema,
  restartDraftSchema,
} from "../generics/automation";
import { usePreviewAutomationSchedule } from "./usePreviewAutomationSchedule";
import { useSaveApplicationAutomation } from "./useSaveApplicationAutomation";

export function useAutomationForm(
  id: string,
  initial: AutomationSettings,
  services: string[],
) {
  const [baseline, setBaseline] = useState(initial);
  const [rules, setRules] = useState(initial.rules);
  const [removed, setRemoved] = useState<string[]>([]);
  const [previewInput, setPreviewInput] = useState({ cron: "", timezone: "" });
  const save = useSaveApplicationAutomation(id);
  const preview = usePreviewAutomationSchedule(
    id,
    previewInput.cron,
    previewInput.timezone,
  );
  const names = Array.from(
    new Set([...services, ...baseline.restarts.map((p) => p.service)]),
  ).filter((name) => !removed.includes(name));
  function reload() {
    setBaseline(initial);
    setPreviewInput({ cron: "", timezone: "" });
    setRules(initial.rules);
    setRemoved([]);
  }
  function addRule() {
    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      enabled: true,
      action: "start",
      cron: "0 8 * * 1-5",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
    setRules((previous) => [...previous, rule]);
  }
  function removeRule(event: MouseEvent<HTMLButtonElement>) {
    const rule = event.currentTarget.dataset.rule;
    setRules((previous) => previous.filter((r) => r.id !== rule));
  }
  function removeRestart(event: MouseEvent<HTMLButtonElement>) {
    const service = event.currentTarget.dataset.service;
    if (service) setRemoved((previous) => [...previous, service]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter =
      event.nativeEvent instanceof SubmitEvent
        ? event.nativeEvent.submitter
        : null;
    if (submitter instanceof HTMLButtonElement && submitter.dataset.preview) {
      const key = submitter.dataset.preview;
      setPreviewInput({
        cron: String(data.get(`cron:${key}`) || ""),
        timezone: String(data.get(`timezone:${key}`) || ""),
      });
      return;
    }
    const restarts = [];
    for (const service of names) {
      const raw = data.get(`interval:${service}`);
      const enabled = data.has(`restart:${service}`);
      if (!raw && !enabled) continue;
      const draft = restartDraftSchema.safeParse({
        amount: raw,
        unit: data.get(`unit:${service}`),
      });
      if (!draft.success) {
        toastValidationError(draft.error);
        return;
      }
      const factors = { minutes: 60, hours: 3600, days: 86400 };
      const seconds = draft.data.amount * factors[draft.data.unit];
      const rounded = Math.round(seconds);
      const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(seconds));
      restarts.push({
        service,
        enabled,
        intervalSeconds:
          Math.abs(seconds - rounded) <= tolerance ? rounded : seconds,
      });
    }
    const result = automationSettingsSchema.safeParse({
      version: baseline.version,
      restarts,
      rules: rules.map((r) => ({
        id: r.id,
        enabled: data.has(`enabled:${r.id}`),
        action: data.get(`action:${r.id}`),
        cron: data.get(`cron:${r.id}`),
        timezone: data.get(`timezone:${r.id}`),
      })),
    });
    if (!result.success) {
      toastValidationError(result.error);
      return;
    }
    save.mutate(result.data, {
      onSuccess: function saved(values) {
        setBaseline(values);
        setRules(values.rules);
        setRemoved([]);
      },
    });
  }
  return {
    baseline,
    stale: initial.version !== baseline.version,
    reload,
    rules,
    names,
    save,
    preview,
    previewTimezone: previewInput.timezone,
    addRule,
    removeRule,
    removeRestart,
    submit,
  };
}
