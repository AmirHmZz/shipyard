import { Plus, Trash2 } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { InputField } from "@/components/InputField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { Settings, Draft } from "../generics";

import { useHAProxyFrontend } from "../hooks";

export type HAProxyFrontendProps = {
  frontend: Settings["frontends"][number];
  draft: Draft;
  update: (id: string, values: DraftRow<{ value: string }>[] | null) => void;
};
export function HAProxyFrontend({
  frontend,
  draft,
  update,
}: HAProxyFrontendProps) {
  const { derived, handlers } = useHAProxyFrontend(frontend, draft, update);
  const { defaults, values, id } = derived;
  const { toggleDefaults, addAddress, changeAddress, removeAddress } = handlers;
  return (
    <section
      key={frontend.id}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-lg border p-4"
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
          onCheckedChange={toggleDefaults}
        />
      </div>
      {defaults ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {frontend.defaultAddresses.join(", ")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {values.map((value, index) => (
            <div key={value.rowId} className="flex items-center gap-2">
              <InputField
                className="min-w-0 flex-1"
                label={
                  <>
                    {frontend.name} IP address {index + 1}
                  </>
                }
                labelProps={{ className: "sr-only", htmlFor: `${id}-${index}` }}
                inputProps={{
                  id: `${id}-${index}`,
                  value: value.value,
                  placeholder: "0.0.0.0 or ::",
                  autoComplete: "off",
                  spellCheck: false,
                  className: "font-mono text-sm",
                  onChange: changeAddress,
                  "data-address-row": value.rowId,
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${frontend.name} address ${index + 1}`}
                disabled={values.length === 1}
                onClick={removeAddress}
                data-address-row={value.rowId}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            className="self-start"
            type="button"
            size="sm"
            variant="outline"
            onClick={addAddress}
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
