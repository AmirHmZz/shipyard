import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading } from "@/components/Shared";

import { useApplicationResourceLimits } from "../hooks/useApplicationResourceLimits";
import { useApplicationServices } from "../hooks/useApplicationServices";
import { ResourceLimitsForm } from "./ResourceLimitsForm";

export type ApplicationResourceLimitsProps = { app: Resource };
export function ApplicationResourceLimits({
  app,
}: ApplicationResourceLimitsProps) {
  const query = useApplicationResourceLimits(app.id);
  const services = useApplicationServices(app);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <div className="flex flex-col gap-5">
      {services.error && <ErrorState error={services.error} />}
      <p role="status">
        {query.data.pending
          ? "Saved limits differ from the active release. Deploy to apply."
          : "No pending resource limit changes."}
      </p>
      <ResourceLimitsForm
        key={app.id}
        app={app}
        initial={query.data}
        services={
          services.data
            ? services.data.map((service) => service.name)
            : Object.keys(query.data.services)
        }
      />
    </div>
  );
}
