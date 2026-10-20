import type * as React from "react";

import type { ResourceFormProps } from "@/components/resource-forms/controller";
import type { Options } from "@/components/resource-forms/Options";

import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { describeError } from "@/lib/api/translate-error";

export type RouteFieldsProps = {
  resources: ResourceFormProps["resources"];
  services: Options["services"];
};
export function RouteFields({ resources, services }: RouteFieldsProps) {
  function handleSelectControlValueChange(value: string) {
    return update("zoneId", value);
  }

  function handleInputGroupInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return update("domain", e.target.value);
  }
  function handleButtonClick() {
    return void services.refetch();
  }

  const {
    state: { data },
    handlers: { update },
  } = useResourceForm();
  const zone = resources.find((r) => r.id === data.zoneId && r.kind === "zone");
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Label>Connected zone</Label>
        {
          <SelectControl
            value={String(data.zoneId || "") || undefined}
            onValueChange={handleSelectControlValueChange}
            options={resources
              .filter((r) => r.kind === "zone")
              .map((r) => ({
                value: r.id,
                label: String(r.data.domain),
              }))}
            placeholder={"Select connected zone"}
            disabled={false}
            triggerProps={{
              id: undefined,
              className: "w-full",
              "aria-label": "Select connected zone",
            }}
          />
        }
      </div>
      <div className="space-y-2">
        <Label htmlFor="route-subdomain">Subdomain</Label>
        <InputGroup>
          <InputGroupInput
            id="route-subdomain"
            value={String(data.domain || "")}
            onChange={handleInputGroupInputChange}
            disabled={!zone}
            placeholder="api or *.apps"
          />
          {zone && (
            <InputGroupAddon align="inline-end">
              <InputGroupText>.{String(zone.data.domain)}</InputGroupText>
            </InputGroupAddon>
          )}
        </InputGroup>
        <p className="text-xs text-muted-foreground">
          Leave blank for the zone itself.
        </p>
      </div>
      {services.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {describeError(services.error)}
            <Button type="button" onClick={handleButtonClick}>
              Retry service discovery
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
