import { RefreshCw } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SectionRow } from "@/components/SectionRow";
import { Empty, ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { useApplicationNetworkingPage } from "../hooks";

import { NetworkServiceCard } from "./NetworkServiceCard";

export type ServiceNetworkingProps = {
  app: Resource;
  page: ReturnType<typeof useApplicationNetworkingPage>;
};
export function ServiceNetworking({ app, page }: ServiceNetworkingProps) {
  const { draft } = page.state;
  const { q, services, networks, busy, saved, serviceRows, ignoredServices } =
    page.derived;
  const { update, saveNetworks, refreshServices } = page.handlers;
  return (
    <section className="flex flex-col gap-4">
      <SectionRow>
        <div>
          <h2 className="font-semibold">Service networking</h2>
          <p className="text-sm text-muted-foreground">
            Manage container hostnames and network connections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={services.isFetching || !app.canWrite}
            onClick={refreshServices}
          >
            <RefreshCw />
            Refresh Compose services
          </Button>
          <Button
            size="sm"
            disabled={busy || !app.canWrite || !draft}
            onClick={saveNetworks}
          >
            Save networking
          </Button>
        </div>
      </SectionRow>
      <Alert>
        <AlertDescription>
          {saved || q.data?.pending
            ? "Saved networking changes are pending. Deploy to apply them."
            : "Network connections and hostnames apply on the next deployment. Routed services receive reserved ingress addresses automatically."}{" "}
          Fixed service addresses and published host ports use recreate
          deployment.
        </AlertDescription>
      </Alert>
      {services.error && <ErrorState error={services.error} />}
      {!!ignoredServices && (
        <Alert>
          <AlertDescription>
            Compose port publishing is ignored for: {ignoredServices}. Only
            platform-administrator port exceptions are applied.
          </AlertDescription>
        </Alert>
      )}
      {services.isLoading && <Loading />}
      {services.isSuccess && !serviceRows.length && (
        <Empty
          title="No services found"
          description="Refresh Compose services after adding a service to your application source."
        />
      )}
      {serviceRows.map(({ service, state }) => (
        <NetworkServiceCard
          key={service.name}
          app={app}
          service={service}
          state={state}
          update={update}
          networks={networks}
        />
      ))}
    </section>
  );
}
