import type { Options } from "@/components/resource-forms/options";

import {
  useResourceForm,
  type ResourceFormProps,
} from "@/components/resource-forms/controller";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";

import { choose } from "../utils";

export function RouteFields({
  resources,
  services,
}: {
  resources: ResourceFormProps["resources"];
  services: Options["services"];
}) {
  const {
    state: { data },
    actions: { update },
  } = useResourceForm();
  const zone = resources.find((r) => r.id === data.zoneId && r.kind === "zone");
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Label>Connected zone</Label>
        {choose(
          String(data.zoneId || ""),
          (value) => update("zoneId", value),
          resources
            .filter((r) => r.kind === "zone")
            .map((r) => ({
              value: r.id,
              label: String(r.data.domain),
            })),
          "Select connected zone",
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="route-subdomain">Subdomain</Label>
        <InputGroup>
          <InputGroupInput
            id="route-subdomain"
            value={String(data.domain || "")}
            onChange={(e) => update("domain", e.target.value)}
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
            {errorMessage(services.error)}
            <Button type="button" onClick={() => void services.refetch()}>
              Retry service discovery
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
