import { Cpu, Save } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SettingsSection } from "@/components/SettingsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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
    <form onSubmit={submit}>
      <fieldset
        key={baseline.version}
        disabled={!app.canWrite || save.isPending}
        className="flex min-w-0 flex-col gap-5"
      >
        {stale && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
          >
            <p>
              Settings changed remotely. Your draft is preserved. Reload saved
              settings before saving.
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              Reload saved settings
            </Button>
          </div>
        )}
        <SettingsSection
          title="Service limits"
          description="Leave a field empty to use Compose or platform defaults. Limits apply on the next deployment."
          icon={<Cpu />}
          action={
            <Badge variant="secondary">
              {names.length} {names.length === 1 ? "service" : "services"}
            </Badge>
          }
        >
          <div className="divide-y">
            {!names.length && (
              <p className="p-6 text-sm text-muted-foreground">
                No services found. Add services to your application source to
                configure limits.
              </p>
            )}
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
          </div>
          <div className="border-t bg-muted/20 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
            CPU is measured in cores (0.5 = half a core). Minimum RAM is 6 MiB.
            Rollback restores the retained release’s limits.
          </div>
        </SettingsSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Save your limits, then deploy to apply them.
          </p>
          <Button type="submit">
            {save.isPending ? <Spinner /> : <Save />}Save resource limits
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
