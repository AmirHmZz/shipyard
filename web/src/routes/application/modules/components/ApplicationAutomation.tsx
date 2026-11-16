import type { Resource } from "@/lib/api/types";

import { SettingsHeading } from "@/components/SettingsHeading";
import { ErrorState, Loading } from "@/components/Shared";

import { useApplicationAutomation } from "../hooks/useApplicationAutomation";
import { useApplicationServices } from "../hooks/useApplicationServices";
import { AutomationActivity } from "./AutomationActivity";
import { AutomationForm } from "./AutomationForm";

export type ApplicationAutomationProps = { app: Resource };
export function ApplicationAutomation({ app }: ApplicationAutomationProps) {
  const query = useApplicationAutomation(app.id);
  const services = useApplicationServices(app);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const status = query.data;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeading
        title="Automation"
        description="Set a restart rhythm for your services and schedule when your application starts or stops."
      />
      {services.error && <ErrorState error={services.error} />}
      <AutomationForm
        key={app.id}
        app={app}
        initial={status}
        services={
          services.data
            ? services.data.map((service) => service.name)
            : status.restarts.map((policy) => policy.service)
        }
      />
      <AutomationActivity status={status} />
    </div>
  );
}
