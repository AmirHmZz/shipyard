import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Variables } from "@/components/variables";

export type ProjectVariablesDialogProps = {
  variables: Resource | null;
  setVariables: (value: Resource | null) => void;
  resources: Resource[];
};
export function ProjectVariablesDialog({
  variables,
  setVariables,
  resources,
}: ProjectVariablesDialogProps) {
  function handleDialogOpenChange(v: boolean) {
    return !v && setVariables(null);
  }

  return (
    <Dialog open={!!variables} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{variables?.name} variables</DialogTitle>
          <DialogDescription>
            Inherited by applications in this environment. Application variables
            take precedence.
          </DialogDescription>
        </DialogHeader>
        {variables && (
          <Variables
            resource={resources.find((r) => r.id === variables.id) || variables}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
