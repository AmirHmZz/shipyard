import { SelectControl } from "@/components/SelectControl";
import { PageHeader, Loading, ErrorState } from "@/components/Shared";

import { useMonitoringPage } from "../hooks/useMonitoringPage";
import { MonitoringDefaults } from "./MonitoringDefaults";
import { MonitoringResourceDetail } from "./MonitoringResourceDetail";
export function MonitoringMainView() {
  const page = useMonitoringPage();
  if (page.query.isPending) return <Loading />;
  if (page.query.error) return <ErrorState error={page.query.error} />;
  const resourceContent = page.selected ? (
    <MonitoringResourceDetail
      key={page.selected.id}
      resource={page.selected}
      range={page.range}
    />
  ) : (
    <p>No resources available to monitor.</p>
  );
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Monitoring"
        description="Server and application resources, alert policies and incidents. Samples every 30 seconds; history retained for 30 days."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <SelectControl
          value={page.view}
          onValueChange={page.selectView}
          options={[
            { value: "resources", label: "Resources" },
            { value: "defaults", label: "Alert defaults" },
          ]}
          triggerProps={{ "aria-label": "Monitoring view" }}
        />
        {page.view !== "defaults" && (
          <>
            <SelectControl
              value={page.type}
              onValueChange={page.selectType}
              options={[
                { value: "all", label: "All resources" },
                { value: "server", label: "Servers" },
                { value: "application", label: "Applications" },
              ]}
              triggerProps={{ "aria-label": "Resource type" }}
            />
            <SelectControl
              value={page.selected?.id}
              onValueChange={page.selectResource}
              options={page.resources.map((r) => ({
                value: r.id,
                label: `${r.name} · ${r.status}`,
              }))}
              triggerProps={{ "aria-label": "Monitored resource" }}
            />
            <SelectControl
              value={page.range}
              onValueChange={page.selectRange}
              options={[
                { value: "1h", label: "Last hour" },
                { value: "6h", label: "Last 6 hours" },
                { value: "24h", label: "Last 24 hours" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
              ]}
              triggerProps={{ "aria-label": "History range" }}
            />
          </>
        )}
      </div>
      {page.view === "defaults" ? <MonitoringDefaults /> : resourceContent}
    </>
  );
}
