import type { FormEvent, MouseEvent } from "react";

import { useState } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import type {
  ResourceLimits,
  ResourceLimitsInput,
} from "../generics/automation";

import {
  resourceLimitDraftSchema,
  resourceLimitsInputSchema,
} from "../generics/automation";
import { useSaveApplicationResourceLimits } from "./useSaveApplicationResourceLimits";

export function useResourceLimitsForm(
  id: string,
  initial: ResourceLimits,
  services: string[],
) {
  const save = useSaveApplicationResourceLimits(id);
  const [baseline, setBaseline] = useState(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const names = Array.from(
    new Set([...services, ...Object.keys(baseline.services)]),
  ).filter((name) => !removed.includes(name));
  function reload() {
    setBaseline(initial);
    setRemoved([]);
  }
  function remove(event: MouseEvent<HTMLButtonElement>) {
    const service = event.currentTarget.dataset.service;
    if (service) setRemoved((previous) => [...previous, service]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: ResourceLimitsInput = {
      version: baseline.version,
      services: {},
    };
    for (const service of names) {
      const draft = resourceLimitDraftSchema.safeParse({
        cpu: data.get(`cpu:${service}`),
        memory: data.get(`memory:${service}`),
        unit: data.get(`unit:${service}`),
      });
      if (!draft.success) {
        toastValidationError(draft.error);
        return;
      }
      const { cpu, memory, unit } = draft.data;
      if (cpu || memory)
        values.services[service] = {
          ...(cpu ? { cpus: Number(cpu) } : {}),
          ...(memory
            ? {
                memoryBytes:
                  Number(memory) * (unit === "GiB" ? 1073741824 : 1048576),
              }
            : {}),
        };
    }
    const result = resourceLimitsInputSchema.safeParse(values);
    if (!result.success) {
      toastValidationError(result.error);
      return;
    }
    save.mutate(result.data, {
      onSuccess: function saved(values) {
        setBaseline(values);
        setRemoved([]);
      },
    });
  }
  return {
    names,
    save,
    submit,
    remove,
    baseline,
    stale: initial.version !== baseline.version,
    reload,
  };
}
