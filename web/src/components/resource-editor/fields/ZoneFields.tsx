import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useResourceForm } from "@/components/resource-forms/controller";
import type { Options } from "@/components/resource-forms/options";
import { choose } from "../utils";

export function ZoneFields({
  availableZones,
  selectableZones,
}: {
  availableZones: Options["availableZones"];
  selectableZones: { id: string; name: string }[];
}) {
  const {
    state: { data, parent },
    actions: { setData },
    meta: { parentOptions },
  } = useResourceForm();
  return (
    <section className="space-y-3">
      <Label>Available domain</Label>
      {!parentOptions.length && (
        <p>
          No DNS providers connected. Configure a provider under Integrations
          first.
        </p>
      )}
      {availableZones.isFetching ? (
        <p className="text-muted-foreground">Loading provider domains…</p>
      ) : availableZones.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessage(availableZones.error)}
            <Button
              type="button"
              variant="outline"
              onClick={() => void availableZones.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        choose(
          String(data.providerZoneId || ""),
          (id) => {
            const zone = availableZones.data?.find((z) => z.id === id);
            if (zone)
              setData({
                domain: zone.name,
                providerZoneId: zone.id,
              });
          },
          selectableZones.map((z) => ({
            value: z.id,
            label: z.name,
          })),
          "Select available domain",
          !parent || !selectableZones.length,
        )
      )}
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
