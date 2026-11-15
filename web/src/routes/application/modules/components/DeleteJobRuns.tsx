import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useDeleteJobRuns } from "../hooks/useDeleteJobRuns";

export type DeleteJobRunsProps = {
  appId: string;
  ids: string[];
  onClose: () => void;
  onDeleted: () => void;
};
export function DeleteJobRuns({
  appId,
  ids,
  onClose,
  onDeleted,
}: DeleteJobRunsProps) {
  const remove = useDeleteJobRuns(appId);
  function changeOpen(open: boolean) {
    if (!open && !remove.isPending) onClose();
  }
  function confirm() {
    remove.mutate(ids, { onSuccess: onDeleted });
  }
  return (
    <Dialog open onOpenChange={changeOpen}>
      <DialogContent showCloseButton={!remove.isPending}>
        <DialogHeader>
          <DialogTitle>
            Delete {ids.length} job run{ids.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the selected runs, their attempt history,
            and their logs. Releases and application volumes are retained.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={remove.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={remove.isPending}
          >
            Delete runs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
