import { Plus, Trash2 } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { draftRow } from "@/lib/draft-rows";

import type { Settings, Draft } from "../generics";

export function HAProxyFrontend({
  frontend,
  draft,
  update,
}: {
  frontend: Settings["frontends"][number];
  draft: Draft;
  update: (id: string, values: DraftRow<{ value: string }>[] | null) => void;
}) {
  const custom = draft.bindings[frontend.id];
  const defaults = custom === undefined;
  const values = custom || [];
  const id = `haproxy-${frontend.id}`;
  return (
    <section
      key={frontend.id}
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="break-words text-sm font-medium">
            {frontend.name}
          </h3>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {frontend.protocol}
            {frontend.applicationName && ` · ${frontend.applicationName}`}
          </p>
        </div>
        <Badge variant="secondary" className="font-mono font-normal">
          {frontend.ports.join(" / ")}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-defaults`}>Use default addresses</Label>
        <Switch
          id={`${id}-defaults`}
          checked={defaults}
          onCheckedChange={(useDefaults) =>
            update(
              frontend.id,
              useDefaults
                ? null
                : frontend.defaultAddresses.map((value) => draftRow({ value })),
            )
          }
        />
      </div>
      {defaults ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {frontend.defaultAddresses.join(", ")}
        </p>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={value.rowId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Label className="sr-only" htmlFor={`${id}-${index}`}>
                  {frontend.name} IP address {index + 1}
                </Label>
                <Input
                  id={`${id}-${index}`}
                  value={value.value}
                  placeholder="0.0.0.0 or ::"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-sm"
                  onChange={(event) =>
                    update(
                      frontend.id,
                      values.map((v, i) =>
                        i === index ? { ...v, value: event.target.value } : v,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${frontend.name} address ${index + 1}`}
                disabled={values.length === 1}
                onClick={() =>
                  update(
                    frontend.id,
                    values.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update(frontend.id, [...values, draftRow({ value: "" })])
            }
          >
            <Plus /> Add address
          </Button>
        </div>
      )}
      {frontend.id === "web" && (
        <p className="text-xs text-muted-foreground">
          HTTPS listens on port 443 when a certificate is available.
        </p>
      )}
    </section>
  );
}
