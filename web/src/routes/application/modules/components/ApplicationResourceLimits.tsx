import { CheckCircle2, Rocket } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SettingsHeading } from "@/components/SettingsHeading";
import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <div className="flex flex-col gap-6">
      <SettingsHeading
        title="Resource limits"
        description="Control how much CPU and memory each service can use, per container replica."
      />
      {services.error && <ErrorState error={services.error} />}
      <Alert role="status" className="border-primary/20 bg-primary/5">
        {query.data.pending ? <Rocket /> : <CheckCircle2 />}
        <AlertDescription>
          {query.data.pending
            ? "Saved limits differ from the active release. Deploy to apply."
            : "No pending resource limit changes."}
        </AlertDescription>
      </Alert>
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
