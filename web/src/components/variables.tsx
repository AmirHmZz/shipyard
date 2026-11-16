import { Rocket, ShieldCheck } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SettingsHeading } from "@/components/SettingsHeading";
import { Confirm } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { useVariableController } from "@/lib/hooks/useVariableController";
import { cn } from "@/lib/utils";

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
  const { keys, secretKeys } = controller.derived;
  const { setRemove, save } = controller.handlers;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading
        title="Variables"
        description="Manage runtime configuration and build secrets. Preview environments use their own explicitly configured variables."
        action={
          <Badge variant="outline" className="gap-1.5 py-1.5">
            <Rocket className="size-3.5" />
            Redeploy to apply changes
          </Badge>
        }
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">{keys.length}</strong>{" "}
          variables
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          <strong className="font-medium text-foreground">
            {secretKeys.size}
          </strong>{" "}
          encrypted secrets
        </span>
        <span>Ordinary values are visible to project readers.</span>
      </div>
      <div
        className={cn(
          "grid items-start gap-5",
          resource.canWrite && "xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]",
        )}
      >
        <VariableTable controller={controller} />
        {resource.canWrite && <VariableEditor controller={controller} />}
      </div>
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
