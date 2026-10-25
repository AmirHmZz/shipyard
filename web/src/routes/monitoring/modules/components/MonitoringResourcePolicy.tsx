import type { MonitoringResource } from "@/lib/schemas/monitoring";

import { ErrorState, Loading } from "@/components/Shared";
import { useResources } from "@/lib/hooks/useResources";

import { useMonitoringPolicy, useSaveMonitoringPolicy } from "../hooks";
import { MonitoringPolicyEditor } from "./MonitoringPolicyEditor";
export type MonitoringResourcePolicyProps = { resource: MonitoringResource };
export function MonitoringResourcePolicy({
  resource,
}: MonitoringResourcePolicyProps) {
  const query = useMonitoringPolicy(resource.id);
  const save = useSaveMonitoringPolicy(resource.id);
  const resources = useResources();
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;
  return (
    <MonitoringPolicyEditor
      title="Resource alert policy"
      kind={resource.kind}
      value={query.data}
      destinations={(resources.data || []).filter((r) => r.kind === "webhook")}
      pending={save.isPending}
      onSave={save.mutate}
    />
  );
}
