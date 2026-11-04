import type * as React from "react";

import type { Options } from "@/components/resource-forms/Options";

import { FormField } from "@/components/FormField";
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
import { describeError } from "@/lib/api/translate-error";

export type RouteFieldsProps = {
  services: Options["services"];
};
export function RouteFields({ services }: RouteFieldsProps) {
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
    derived: { domainAccess, routeZone, routeSubdomain },
    handlers: { update },
  } = useResourceForm();
  const zones = domainAccess.data ?? [];
  return (
    <section className="flex flex-col gap-4">
      <FormField label={<>Connected zone</>} labelProps={{}}>
        {
          <SelectControl
            value={String(data.zoneId || "") || undefined}
            onValueChange={handleSelectControlValueChange}
            options={zones.map((zone) => ({
              value: zone.zoneId,
              label: zone.domain,
            }))}
            placeholder={"Select connected zone"}
            disabled={domainAccess.isPending || zones.length === 0}
            triggerProps={{
              id: undefined,
              className: "w-full",
              "aria-label": "Select connected zone",
            }}
          />
        }
      </FormField>
      <FormField
        label={<>Subdomain</>}
        labelProps={{ htmlFor: "route-subdomain" }}
      >
        <InputGroup>
          <InputGroupInput
            id="route-subdomain"
            value={routeSubdomain}
            onChange={handleInputGroupInputChange}
            disabled={!routeZone}
            placeholder="api or *.apps"
          />
          {routeZone && (
            <InputGroupAddon align="inline-end">
              <InputGroupText>.{routeZone.domain}</InputGroupText>
            </InputGroupAddon>
          )}
        </InputGroup>
        {routeZone?.mode === "whole" && (
          <p className="text-xs text-muted-foreground">
            Leave blank for the zone itself.
          </p>
        )}
        {routeZone?.mode === "scoped" && (
          <p className="text-xs text-muted-foreground">
            Allowed hostnames: {routeZone.patterns.join(", ")}
          </p>
        )}
      </FormField>
      {domainAccess.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {describeError(domainAccess.error)}
          </AlertDescription>
        </Alert>
      )}
      {domainAccess.isSuccess && zones.length === 0 && (
        <p className="text-xs text-muted-foreground">
          This application's team has no connected zone access.
        </p>
      )}
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
