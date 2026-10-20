import { ShieldCheck } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Confirm } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVariableController } from "@/lib/hooks/useVariableController";

import { VariableEditor } from "./VariableEditor";
import { VariableTable } from "./VariableTable";
export type VariableController = ReturnType<typeof useVariableController>;

export type VariablesProps = { resource: Resource };
export function Variables({ resource }: VariablesProps) {
  function handleConfirmOpenChange(v: boolean) {
    return !v && setRemove("");
  }
  function handleConfirmConfirm() {
    return save(remove, null, secretKeys.has(remove));
  }

  const controller = useVariableController(resource);
  const { remove } = controller.state;
  const { secretKeys } = controller.derived;
  const { setRemove, save } = controller.handlers;
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
        onOpenChange={handleConfirmOpenChange}
        title="Remove variable?"
        description={`${remove} will be removed from this scope. Redeploy applications to apply the change.`}
        destructive
        pending={controller.derived.busy}
        onConfirm={handleConfirmConfirm}
      />
    </div>
  );
}
