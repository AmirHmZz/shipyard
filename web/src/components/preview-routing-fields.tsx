import { useId } from "react";

import type { PreviewRouting } from "@/lib/application-settings";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inputNumberSchema } from "@/lib/schemas/coercion";

export function PreviewRoutingFields({
  value,
  onChange,
  hasRoutes,
  disabled = false,
}: {
  value: PreviewRouting;
  onChange: (value: PreviewRouting) => void;
  hasRoutes: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  function changeMode(mode: string) {
    if (mode === "target") {
      onChange({
        mode,
        service: value.mode === "target" ? value.service || "app" : "app",
        port: value.mode === "target" ? value.port || 0 : 0,
      });
      return;
    }
    if (mode === "inherit" || mode === "private") onChange({ mode });
  }
  return (
    <div className="space-y-3">
      <Select value={value.mode} disabled={disabled} onValueChange={changeMode}>
        <SelectTrigger aria-label="Preview routing">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="inherit" disabled={!hasRoutes}>
            Inherit HTTP/gRPC routes
          </SelectItem>
          <SelectItem value="target">Explicit service and port</SelectItem>
          <SelectItem value="private">Private preview</SelectItem>
        </SelectContent>
      </Select>
      {!hasRoutes && value.mode === "inherit" && (
        <p className="text-xs text-muted-foreground">
          This application has no HTTP/gRPC routes. Choose an explicit target or
          a private preview.
        </p>
      )}
      {value.mode === "target" && (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-service`}>Preview service</Label>
            <Input
              id={`${id}-service`}
              value={value.service || ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, service: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-port`}>Preview port</Label>
            <Input
              id={`${id}-port`}
              type="number"
              min={1}
              max={65535}
              value={value.port || ""}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  port: inputNumberSchema.parse(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}
      {value.mode === "private" && (
        <p className="text-xs text-muted-foreground">
          Preview containers deploy without a public route.
        </p>
      )}
    </div>
  );
}
