import { useState } from "react";

import type { Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";

import type { Source } from "../generics";

import { composeSourceSchema } from "../generics";
import { useComposeSource } from "./useComposeSource";
import { useDeployComposeSource } from "./useDeployComposeSource";
import { useSaveComposeSource } from "./useSaveComposeSource";
export function useComposeSourceForm(
  app: Resource,
  onDeploy: (id: string) => void,
) {
  const changes = useConfigurationChanges();
  const q = useComposeSource(app);
  const saveSource = useSaveComposeSource(app.id);
  const deploySource = useDeployComposeSource(app.id);
  const [editedDraft, setDraft] = useState<Source | null>(null);
  const draft = editedDraft ?? saveSource.data ?? q.data ?? null;
  const busy = saveSource.isPending || deploySource.isPending;
  const failure = saveSource.error ?? deploySource.error ?? q.error;
  const error = failure ? describeError(failure) : "";
  const saved = saveSource.isSuccess && editedDraft === null;
  async function reload() {
    const result = await q.refetch();
    if (!result.error && result.data) {
      changes.saved();
      setDraft(null);
      saveSource.reset();
      deploySource.reset();
    }
  }
  function save(deploy: boolean) {
    if (!draft || busy) return;
    const parsed = composeSourceSchema.safeParse(draft);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveSource.reset();
    deploySource.reset();
    saveSource.mutate(parsed.data, {
      onSuccess: (result) => {
        changes.saved();
        setDraft(null);
        if (deploy) {
          deploySource.mutate(
            { version: result.version },
            {
              onSuccess: (deployment) => {
                changes.saved();
                onDeploy(deployment.id);
              },
            },
          );
        }
      },
    });
  }

  function changeYaml(yaml: string) {
    if (yaml === draft?.yaml) return;
    changes.change();
    setDraft((current) => {
      const source = current ?? draft;
      return source ? { ...source, yaml } : source;
    });
  }
  function reloadSource() {
    void reload();
  }
  function saveOnly() {
    save(false);
  }
  function saveAndDeploy() {
    save(true);
  }
  return {
    state: { draft },
    derived: { q, busy, error, saved },
    handlers: { changeYaml, reloadSource, saveOnly, saveAndDeploy },
  };
}
