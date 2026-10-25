import type { MonitoringPolicyState } from "@/lib/schemas/monitoring";

import { ErrorState, Loading } from "@/components/Shared";
import { useResources } from "@/lib/hooks/useResources";

import { useMonitoringDefaults, useSaveMonitoringDefaults } from "../hooks";
import { MonitoringPolicyEditor } from "./MonitoringPolicyEditor";
export function MonitoringDefaults() {
  const query = useMonitoringDefaults();
  const save = useSaveMonitoringDefaults();
  const resources = useResources();
  const destinations = (resources.data || []).filter(
    (r) => r.kind === "webhook",
  );
  function saveServer(value: MonitoringPolicyState) {
    if (query.data) save.mutate({ ...query.data, server: value.policy });
  }
  function saveApplication(value: MonitoringPolicyState) {
    if (query.data) save.mutate({ ...query.data, application: value.policy });
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <MonitoringPolicyEditor
        defaults
        title="Server defaults"
        kind="server"
        value={{ mode: "override", policy: query.data.server }}
        destinations={destinations}
        pending={save.isPending}
        onSave={saveServer}
      />
      <MonitoringPolicyEditor
        defaults
        title="Application defaults"
        kind="application"
        value={{ mode: "override", policy: query.data.application }}
        destinations={destinations}
        pending={save.isPending}
        onSave={saveApplication}
      />
    </div>
  );
}
