import type { Options } from "@/components/resource-forms/Options";

import { useResourceForm } from "@/components/resource-forms/controller";
import { Label } from "@/components/ui/label";

import { ProviderDomainPicker } from "./ProviderDomainPicker";
export type ZoneFieldsProps = {
  availableZones: Options["availableZones"];
  selectableZones: { id: string; name: string }[];
};
export function ZoneFields({
  availableZones,
  selectableZones,
}: ZoneFieldsProps) {
  const {
    state: { parent },
    derived: { parentOptions },
  } = useResourceForm();
  return (
    <section className="flex flex-col gap-3">
      <Label>Available domain</Label>
      {!parentOptions.length && (
        <p>
          No DNS providers connected. Configure a provider under Integrations
          first.
        </p>
      )}
      <ProviderDomainPicker
        availableZones={availableZones}
        selectableZones={selectableZones}
      />
      {!!parent &&
        !availableZones.isFetching &&
        !availableZones.error &&
        !availableZones.data?.length && (
          <p>No domains available from this provider.</p>
        )}
      {!!parent && !!availableZones.data?.length && !selectableZones.length && (
        <p>All domains from this provider are already connected.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Already connected domains are excluded. DNS providers are configured
        under Integrations.
      </p>
    </section>
  );
}
