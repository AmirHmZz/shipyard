import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useWorkspaceSearch } from "../hooks";
export type WorkspaceSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
export function WorkspaceSearch({ open, onOpenChange }: WorkspaceSearchProps) {
  const { state, derived, handlers } = useWorkspaceSearch(onOpenChange);
  const { query } = state;
  const { matches } = derived;
  const { changeQuery, selectResource } = handlers;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Search workspace</DialogTitle>
          <DialogDescription>
            Find projects, applications, and infrastructure.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search by name…"
          value={query}
          onChange={changeQuery}
        />
        <div
          className="max-h-80 flex flex-col gap-1 overflow-auto"
          onClick={selectResource}
        >
          {matches.map((r) => (
            <Button
              key={r.id}
              variant="ghost"
              className="w-full justify-between"
              data-resource-id={r.id}
            >
              <span>{r.name}</span>
              <span className="text-xs text-muted-foreground">{r.kind}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
