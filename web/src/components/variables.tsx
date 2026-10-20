import { ShieldCheck } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Confirm } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVariableController } from "@/lib/hooks/useVariableController";

import { VariableEditor } from "./VariableEditor";
import { VariableTable } from "./VariableTable";
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
        pending={controller.busy}
        onConfirm={() => save(remove, null, secretKeys.has(remove))}
      />
    </div>
  );
}
