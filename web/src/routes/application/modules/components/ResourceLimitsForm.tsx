import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";

import type { ResourceLimits } from "../generics/automation";

import { useResourceLimitsForm } from "../hooks/useResourceLimitsForm";
import { ServiceResourceLimitsRow } from "./ServiceResourceLimitsRow";

export type ResourceLimitsFormProps = {
  app: Resource;
  initial: ResourceLimits;
  services: string[];
};
export function ResourceLimitsForm({
  app,
  initial,
  services,
}: ResourceLimitsFormProps) {
  const { names, save, submit, remove, baseline, stale, reload } =
    useResourceLimitsForm(app.id, initial, services);
  return (
    <form onSubmit={submit} className="max-w-2xl">
      <fieldset
        key={baseline.version}
        disabled={!app.canWrite || save.isPending}
        className="flex flex-col gap-4"
      >
        {stale && (
          <div role="alert">
            <p>
              Settings changed remotely. Your draft is preserved. Reload saved
              settings before saving.
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              Reload saved settings
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Limits apply to each container replica on the next deployment. Leave a
          field empty to use Compose/default. CPU is measured in cores, for
          example 0.5. RAM must be at least 6 MiB. Rollback restores the
          retained release’s limits.
        </p>
        {names.map((name) => (
          <ServiceResourceLimitsRow
            key={name}
            name={name}
            active={services.includes(name)}
            cpus={baseline.services[name]?.cpus}
            memoryBytes={baseline.services[name]?.memoryBytes}
            remove={remove}
          />
        ))}
        <Button type="submit">Save resource limits</Button>
      </fieldset>
    </form>
  );
}
