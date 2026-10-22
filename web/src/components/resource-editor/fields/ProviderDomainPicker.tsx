import type { Options } from "@/components/resource-forms/Options";

import { useResourceForm } from "@/components/resource-forms/controller";
import { SelectControl } from "@/components/SelectControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/translate-error";
export type ProviderDomainPickerProps = {
  availableZones: Options["availableZones"];
  selectableZones: { id: string; name: string }[];
};
export function ProviderDomainPicker({
  availableZones,
  selectableZones,
}: ProviderDomainPickerProps) {
  const {
    state: { data, parent },
    handlers: { setData },
  } = useResourceForm();
  function handleSelectControlValueChange(id: string) {
    const zone = availableZones.data?.find((zone) => zone.id === id);
    if (zone) setData({ domain: zone.name, providerZoneId: zone.id });
  }
  function handleButtonClick() {
    void availableZones.refetch();
  }
  if (availableZones.isFetching)
    return <p className="text-muted-foreground">Loading provider domains…</p>;
  if (availableZones.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {describeError(availableZones.error)}
          <Button type="button" variant="outline" onClick={handleButtonClick}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <SelectControl
      value={String(data.providerZoneId || "") || undefined}
      onValueChange={handleSelectControlValueChange}
      options={selectableZones.map((z) => ({
        value: z.id,
        label: z.name,
      }))}
      placeholder={"Select available domain"}
      disabled={!parent || !selectableZones.length}
      triggerProps={{
        id: undefined,
        className: "w-full",
        "aria-label": "Select available domain",
      }}
    />
  );
}
