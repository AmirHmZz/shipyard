import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useApplicationNetworkingPage } from "../hooks";
import { ConfigurationScope } from "./ConfigurationScope";
import { NetworkServiceCard } from "./NetworkServiceCard";
import { PublishedPorts } from "./PublishedPorts";
export type ApplicationNetworkingProps = { app: Resource };
export function ApplicationNetworking({ app }: ApplicationNetworkingProps) {
  const { state, derived, handlers } = useApplicationNetworkingPage(app);
  const { draft, ports } = state;
  const {
    q,
    services,
    networks,
    account,
    busy,
    error,
    saved,
    publicPorts,
    serviceRows,
    ignoredServices,
  } = derived;
  const { update, editPorts, save, saveNetworks, refreshServices } = handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <ConfigurationScope name="networking">
      <div className="flex flex-col gap-5">
        {!!q.data?.endpoints?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Active container addresses</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {q.data.endpoints.map((endpoint) => (
                <div
                  key={JSON.stringify([
                    endpoint.service,
                    endpoint.replica,
                    endpoint.ingress,
                    endpoint.dockerName,
                  ])}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"
                >
                  <span>
                    {endpoint.service} · container {endpoint.replica} ·{" "}
                    {endpoint.ingress ? "HAProxy ingress" : endpoint.dockerName}
                  </span>
                  <code className="text-xs">
                    {[endpoint.ipv4, endpoint.ipv6]
                      .filter(Boolean)
                      .join(" / ") || "Docker-assigned"}
                  </code>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
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
        <Button
          className="self-start"
          variant="outline"
          disabled={services.isFetching || !app.canWrite}
          onClick={refreshServices}
        >
          Refresh Compose services
        </Button>
        {!!ignoredServices && (
          <Alert>
            <AlertDescription>
              Compose port publishing is ignored for: {ignoredServices}. Only
              platform-administrator port exceptions are applied.
            </AlertDescription>
          </Alert>
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
        <Button
          className="self-start"
          disabled={busy || !app.canWrite || !draft}
          onClick={saveNetworks}
        >
          Save networking
        </Button>
        {account?.admin && app.data.workload !== "job" && (
          <ConfigurationScope name="published-ports">
            <PublishedPorts
              services={services}
              publicPorts={publicPorts}
              editPorts={editPorts}
              busy={busy}
              ports={ports}
              save={save}
            />
          </ConfigurationScope>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </ConfigurationScope>
  );
}
