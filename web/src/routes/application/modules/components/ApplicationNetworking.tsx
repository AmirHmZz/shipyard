import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { Resource } from "@/lib/api";
import type { DraftRow } from "@/lib/draft-rows";

import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage, useAccount, useResources } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow, withoutRowId } from "@/lib/draft-rows";
import { resourceKeys } from "@/lib/query-keys";

import type { Service, Port } from "../generics";

import {
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "../generics";
import { applicationKeys } from "../generics";
import { useApplicationNetworking, useApplicationServices } from "../hooks";
import { saveApplicationNetworking } from "../services";
import { ConfigurationScope } from "./ConfigurationScope";
import { NetworkServiceCard } from "./NetworkServiceCard";
import { PublishedPorts } from "./PublishedPorts";

export function ApplicationNetworking({ app }: { app: Resource }) {
  const networkingChanges = useConfigurationChanges("networking");
  const portChanges = useConfigurationChanges("published-ports");
  const q = useApplicationNetworking(app);
  const services = useApplicationServices(app);
  const networks = useResources();
  const account = useAccount();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Service> | null>(null);
  const [ports, setPorts] = useState<Record<string, DraftRow<Port>[]> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedServices = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(q.data?.services || {}).map(([name, service]) => [
          name,
          { ...service, connections: service.connections.map(draftRow) },
        ]),
      ),
    [q.data?.services],
  );
  const savedPorts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(
          (app.data.publishedPorts as Record<string, Port[]>) || {},
        ).map(([name, ports]) => [name, ports.map(draftRow)]),
      ),
    [app.data.publishedPorts],
  );
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const value = draft || savedServices;
  const publicPorts = ports || savedPorts;
  const update = (service: string, next: Partial<Service>) => {
    networkingChanges.change();
    setDraft((current) => {
      const base = current ?? savedServices;
      return {
        ...base,
        [service]: { ...(base[service] || { connections: [] }), ...next },
      };
    });
  };
  function editPorts(next: Record<string, DraftRow<Port>[]>) {
    portChanges.change();
    setPorts(next);
  }
  async function save(published = false) {
    setBusy(true);
    setError("");
    try {
      await saveApplicationNetworking(
        app.id,
        published,
        (published
          ? publishedPortsPayloadSchema
          : networkingPayloadSchema
        ).parse({
          version: app.version,
          services: published
            ? Object.fromEntries(
                Object.entries(publicPorts).map(([name, ports]) => [
                  name,
                  ports.map(withoutRowId),
                ]),
              )
            : Object.fromEntries(
                Object.entries(value).map(([name, service]) => [
                  name,
                  {
                    ...service,
                    connections: service.connections.map(withoutRowId),
                  },
                ]),
              ),
        }),
      );
      (published ? portChanges : networkingChanges).saved();
      setSaved(true);
      if (published) setPorts(null);
      else setDraft(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: resourceKeys.all }),
        client.invalidateQueries({
          queryKey: applicationKeys.networkingPrefix(app.id),
        }),
      ]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConfigurationScope name="networking">
      <div className="space-y-5">
        {!!q.data?.endpoints?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Active container addresses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
          variant="outline"
          disabled={services.isFetching || !app.canWrite}
          onClick={() => void services.refetch()}
        >
          Refresh Compose services
        </Button>
        {services.data?.some((s) => s.ignoredPorts) && (
          <Alert>
            <AlertDescription>
              Compose port publishing is ignored for:{" "}
              {services.data
                .filter((s) => s.ignoredPorts)
                .map((s) => s.name)
                .join(", ")}
              . Only platform-administrator port exceptions are applied.
            </AlertDescription>
          </Alert>
        )}
        {services.data?.map((service) => {
          const state = value[service.name] || { connections: [] };
          return (
            <NetworkServiceCard
              key={service.name}
              app={app}
              service={service}
              state={state}
              update={update}
              networks={networks}
            />
          );
        })}
        <Button
          disabled={busy || !app.canWrite || !draft}
          onClick={() => void save()}
        >
          Save networking
        </Button>
        {account?.admin && (
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
