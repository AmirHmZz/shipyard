import type { FormEvent } from "react";

import { useState } from "react";

import type { ZoneGrantInput } from "@/lib/schemas/hostname-grants";

import { FormField } from "@/components/FormField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toastValidationError } from "@/lib/api/toaster";
import { zoneGrantModeSchema } from "@/lib/schemas/hostname-grants";

import { useSetZoneGrant } from "../hooks/useSetZoneGrant";

const accessModes = [
  { value: "none", label: "No access" },
  { value: "whole", label: "Whole zone" },
  { value: "scoped", label: "Specific hostnames" },
];

export type ZoneGrantFormProps = {
  zoneId: string;
  teamId: string;
  grant?: ZoneGrantInput;
};
export function ZoneGrantForm({ zoneId, teamId, grant }: ZoneGrantFormProps) {
  const [mode, setMode] = useState<ZoneGrantInput["mode"]>(
    grant?.mode ?? "none",
  );
  const [patterns, setPatterns] = useState(grant?.patterns.join("\n") ?? "");
  const change = useSetZoneGrant(zoneId, teamId);
  function changeMode(value: string) {
    const parsed = zoneGrantModeSchema.safeParse(value);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    setMode(parsed.data);
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries =
      mode === "scoped" ? patterns.split(/\s+/).filter(Boolean) : [];
    change.mutate({ mode, patterns: entries });
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <FormField label="Access" labelProps={{ htmlFor: "zone-access-mode" }}>
        <SelectControl
          value={mode}
          options={accessModes}
          onValueChange={changeMode}
          disabled={change.isPending}
          triggerProps={{ id: "zone-access-mode" }}
        />
      </FormField>
      {mode === "scoped" && (
        <FormField
          label="Allowed hostnames"
          labelProps={{ htmlFor: "zone-access-patterns" }}
        >
          <Textarea
            id="zone-access-patterns"
            value={patterns}
            onChange={(event) => setPatterns(event.currentTarget.value)}
            required
            disabled={change.isPending}
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Enter one full hostname or wildcard per line. A wildcard covers
            subdomains below its base hostname.
          </p>
        </FormField>
      )}
      <Button className="self-start" disabled={change.isPending}>
        Save access
      </Button>
    </form>
  );
}
