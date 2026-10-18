import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useResources } from "@/lib/api";
import { useDeferredValue, useMemo, useState } from "react";
import { useNavigate } from "react-router";

export function WorkspaceSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resources = useResources();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => {
    const result = [];
    const term = deferredQuery.toLowerCase();
    for (const resource of resources.data || []) {
      if (resource.name.toLowerCase().includes(term)) result.push(resource);
      if (result.length === 20) break;
    }
    return result;
  }, [resources.data, deferredQuery]);
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
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 space-y-1 overflow-auto">
          {matches.map((r) => (
            <Button
              key={r.id}
              variant="ghost"
              className="w-full justify-between"
              onClick={() => {
                navigate(
                  r.kind === "application"
                    ? `/applications/${r.id}`
                    : r.kind === "project"
                      ? `/projects/${r.id}`
                      : r.kind === "server"
                        ? "/servers"
                        : r.kind === "zone"
                          ? "/dns"
                          : "/integrations",
                );
                onOpenChange(false);
              }}
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
