import type { Resource } from "@/lib/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Variables } from "@/components/variables";

export function ProjectVariablesDialog({
  variables,
  setVariables,
  resources,
}: {
  variables: Resource | null;
  setVariables: (value: Resource | null) => void;
  resources: Resource[];
}) {
  return (
    <Dialog open={!!variables} onOpenChange={(v) => !v && setVariables(null)}>
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
