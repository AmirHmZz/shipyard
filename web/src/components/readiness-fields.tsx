import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { draftRow, withoutRowId } from "@/lib/draft-rows";
import type { HTTPReadinessCheck } from "@/lib/application-settings";

export function ReadinessFields({
  value,
  onChange,
  dockerfile,
}: {
  value: HTTPReadinessCheck[];
  onChange: (checks: HTTPReadinessCheck[]) => void;
  dockerfile: boolean;
}) {
  const [rows, setRows] = useState(() => value.map(draftRow));
  function update(next: typeof rows) {
    setRows(next);
    onChange(next.map(withoutRowId));
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Checks run for every replica, including private services. Public routes
        are optional. Docker health checks also apply.
      </p>
      {rows.map((row) => (
        <div
          key={row.rowId}
          className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 rounded-lg border p-3"
        >
          <div className="space-y-1">
            <Label htmlFor={`${row.rowId}-service`}>Service</Label>
            <Input
              id={`${row.rowId}-service`}
              value={row.service}
              placeholder={dockerfile ? "app" : "Compose service"}
              onChange={(e) =>
                update(
                  rows.map((r) =>
                    r.rowId === row.rowId
                      ? { ...r, service: e.target.value }
                      : r,
                  ),
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${row.rowId}-port`}>Port</Label>
            <Input
              id={`${row.rowId}-port`}
              type="number"
              min={1}
              max={65535}
              value={row.port || ""}
              onChange={(e) =>
                update(
                  rows.map((r) =>
                    r.rowId === row.rowId
                      ? { ...r, port: Number(e.target.value) }
                      : r,
                  ),
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="self-end"
            aria-label="Remove readiness check"
            onClick={() => update(rows.filter((r) => r.rowId !== row.rowId))}
          >
            <Trash2 className="size-4" />
          </Button>
          <div className="col-span-3 space-y-1">
            <Label htmlFor={`${row.rowId}-path`}>HTTP path</Label>
            <Input
              id={`${row.rowId}-path`}
              value={row.path}
              placeholder="/health"
              onChange={(e) =>
                update(
                  rows.map((r) =>
                    r.rowId === row.rowId ? { ...r, path: e.target.value } : r,
                  ),
                )
              }
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          update([
            ...rows,
            draftRow({
              service: dockerfile ? "app" : "",
              port: 0,
              path: "/health",
            }),
          ])
        }
      >
        <Plus className="size-4" />
        Add HTTP check
      </Button>
    </div>
  );
}
