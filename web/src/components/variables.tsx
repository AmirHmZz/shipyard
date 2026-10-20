import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Resource } from "@/lib/api";

import { Confirm } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { resourceKeys } from "@/lib/query-keys";
import { saveVariable } from "@/lib/services";
import { variableFormSchema } from "@/lib/validation";

import { VariableEditor } from "./VariableEditor";
import { VariableTable } from "./VariableTable";
function useVariableController(resource: Resource) {
  const changes = useConfigurationChanges();
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("env:");
  const [secret, setSecret] = useState(false);
  const [editing, setEditing] = useState("");
  const buildScope = scope === "build:" || scope === "preview-build:";
  const isSecret = buildScope || secret;
  const ordinary = resource.variables || {};
  const secretKeys = new Set(
    resource.secretKeys.filter((key) =>
      /^(env|build|preview-env|preview-build):/.test(key),
    ),
  );
  const keys = [...new Set([...Object.keys(ordinary), ...secretKeys])].sort();
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState("");
  function reset() {
    setKey("");
    setValue("");
    setEditing("");
    setSecret(false);
  }
  function edit(name: string) {
    const index = name.indexOf(":");
    setScope(name.slice(0, index + 1));
    setKey(name.slice(index + 1));
    setValue(secretKeys.has(name) ? "" : ordinary[name]);
    setSecret(secretKeys.has(name));
    setEditing(name);
  }
  async function save(name: string, v: string | null, encrypted: boolean) {
    setBusy(true);
    try {
      const values =
        v === null
          ? { name, value: v, encrypted }
          : variableFormSchema.parse({ name, value: v, encrypted });
      await saveVariable(resource, values);
      await client.invalidateQueries({ queryKey: resourceKeys.all });
      if (v !== null || editing === name) {
        reset();
        changes.saved();
      }
      setRemove("");
      toast.success(
        `Variable ${v === null ? "removed" : "saved"}. Deploy to apply it.`,
      );
    } catch (e) {
      if (v === null) throw e;
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    resource,
    changes,
    key,
    setKey,
    value,
    setValue,
    scope,
    setScope,
    secretKeys,
    isSecret,
    setSecret,
    buildScope,
    editing,
    busy,
    ordinary,
    keys,
    remove,
    setRemove,
    reset,
    edit,
    save,
  };
}
export type VariableController = ReturnType<typeof useVariableController>;

export function Variables({ resource }: { resource: Resource }) {
  const controller = useVariableController(resource);
  const { remove, setRemove, save, secretKeys } = controller;
  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertDescription>
          Ordinary variables are visible to project readers. Only secrets are
          encrypted and never returned. Preview variables must be explicitly
          configured. Redeploy to apply changes.
        </AlertDescription>
      </Alert>
      {resource.canWrite && <VariableEditor controller={controller} />}
      <VariableTable controller={controller} />
      <Confirm
        open={!!remove}
        onOpenChange={(v) => !v && setRemove("")}
        title="Remove variable?"
        description={`${remove} will be removed from this scope. Redeploy applications to apply the change.`}
        destructive
        onConfirm={() => save(remove, null, secretKeys.has(remove))}
      />
    </div>
  );
}
