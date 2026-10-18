import { ConfigurationScope } from "@/components/configuration-scope";
import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  errorMessage,
  useAccount,
  useResources,
  type Resource,
} from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow, withoutRowId, type DraftRow } from "@/lib/draft-rows";
import {
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "@/lib/validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
type Attachment = { networkId: string; ipv4?: string; ipv6?: string };
type Service = { hostname?: string; connections: DraftRow<Attachment>[] };
type NetworkService = { hostname?: string; connections: Attachment[] };
type Port = {
  host: string;
  published: number;
  target: number;
  protocol: string;
};
export function ApplicationNetworking({ app }: { app: Resource }) {
  const networkingChanges = useConfigurationChanges("networking");
  const portChanges = useConfigurationChanges("published-ports");
  const q = useQuery({
    queryKey: ["networking", app.id, app.version],
    queryFn: () =>
      api<{
        version: number;
        services: Record<string, NetworkService>;
        pending: boolean;
        endpoints?: {
          service: string;
          replica: number;
          ipv4: string;
          ipv6: string;
          ingress: boolean;
          dockerName: string;
        }[];
      }>(`/applications/${app.id}/networking`),
  });
  const services = useQuery({
    queryKey: ["application-services", app.id, app.version],
    queryFn: () =>
      api<{ name: string; replicas: number; ignoredPorts: boolean }[]>(
        `/applications/${app.id}/services`,
      ),
    enabled: app.canWrite,
    retry: false,
  });
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
      await api(
        `/applications/${app.id}/${published ? "published-ports" : "networking"}`,
        {
          method: "PUT",
          body: JSON.stringify(
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
          ),
        },
      );
      (published ? portChanges : networkingChanges).saved();
      setSaved(true);
      if (published) setPorts(null);
      else setDraft(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["resources"] }),
        client.invalidateQueries({ queryKey: ["networking", app.id] }),
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

function NetworkServiceCard({
  app,
  service,
  state,
  update,
  networks,
}: {
  app: Resource;
  service: { name: string; replicas: number };
  state: Service;
  update: (service: string, next: Partial<Service>) => void;
  networks: { data?: Resource[] };
}) {
  return (
    <Card key={service.name}>
      <CardHeader>
        <CardTitle>{service.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {service.replicas} container
          {service.replicas === 1 ? "" : "s"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`hostname-${service.name}`}>Container hostname</Label>
          <Input
            id={`hostname-${service.name}`}
            value={state.hostname || ""}
            disabled={!app.canWrite}
            onChange={(e) => update(service.name, { hostname: e.target.value })}
          />
        </div>
        {state.connections.map((connection, index) => (
          <div
            className="space-y-3 rounded-lg border p-4"
            key={connection.rowId}
          >
            <Label>Additional network</Label>
            <Select
              value={connection.networkId || undefined}
              disabled={!app.canWrite}
              onValueChange={(id) =>
                update(service.name, {
                  connections: state.connections.map((c, i) =>
                    i === index ? { rowId: c.rowId, networkId: id } : c,
                  ),
                })
              }
            >
              <SelectTrigger aria-label={`Network for ${service.name}`}>
                <SelectValue placeholder="Select granted network" />
              </SelectTrigger>
              <SelectContent>
                {networks.data
                  ?.filter(
                    (r) =>
                      r.kind === "network" &&
                      r.data.serverId === app.data.serverId &&
                      !r.data.ingressApp &&
                      r.data.status === "ready",
                  )
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["ipv4", "ipv6"] as const).map((family) => (
                <div className="space-y-2" key={family}>
                  <Label htmlFor={`${service.name}-${index}-${family}`}>
                    {family === "ipv4" ? "Fixed IPv4" : "Fixed IPv6"} (optional)
                  </Label>
                  <Input
                    id={`${service.name}-${index}-${family}`}
                    disabled={!app.canWrite || service.replicas !== 1}
                    value={connection[family] || ""}
                    onChange={(e) =>
                      update(service.name, {
                        connections: state.connections.map((c, i) =>
                          i === index ? { ...c, [family]: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              disabled={!app.canWrite}
              onClick={() =>
                update(service.name, {
                  connections: state.connections.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 />
              Disconnect on next deployment
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={!app.canWrite}
          onClick={() =>
            update(service.name, {
              connections: [...state.connections, draftRow({ networkId: "" })],
            })
          }
        >
          <Plus />
          Connect network
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishedPorts({
  services,
  publicPorts,
  editPorts,
  busy,
  ports,
  save,
}: {
  services: { data?: { name: string }[] };
  publicPorts: Record<string, DraftRow<Port>[]>;
  editPorts: (next: Record<string, DraftRow<Port>[]>) => void;
  busy: boolean;
  ports: Record<string, DraftRow<Port>[]> | null;
  save: (published: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Published ports · administrator only</CardTitle>
        <p className="text-sm text-muted-foreground">
          Explicit host bindings are exceptions to domain-based ingress. They
          apply on the next deployment.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {services.data?.map((service) => (
          <section key={service.name} className="space-y-3">
            <h3 className="text-sm font-medium">{service.name}</h3>
            {(publicPorts[service.name] || []).map((port, index) => (
              <div
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"
                key={port.rowId}
              >
                {(["host", "published", "target"] as const).map((key) => (
                  <div className="space-y-1" key={key}>
                    <Label htmlFor={`port-${service.name}-${index}-${key}`}>
                      {key === "host"
                        ? "Host IP"
                        : key === "published"
                          ? "Host port"
                          : "Container port"}
                    </Label>
                    <Input
                      id={`port-${service.name}-${index}-${key}`}
                      type={key === "host" ? "text" : "number"}
                      value={port[key]}
                      onChange={(e) =>
                        editPorts({
                          ...publicPorts,
                          [service.name]: publicPorts[service.name].map(
                            (p, i) =>
                              i === index
                                ? {
                                    ...p,
                                    [key]:
                                      key === "host"
                                        ? e.target.value
                                        : Number(e.target.value),
                                  }
                                : p,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <div className="flex items-end gap-1">
                  <Select
                    value={port.protocol}
                    onValueChange={(protocol) =>
                      editPorts({
                        ...publicPorts,
                        [service.name]: publicPorts[service.name].map((p, i) =>
                          i === index ? { ...p, protocol } : p,
                        ),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Port protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove published port"
                    onClick={() =>
                      editPorts({
                        ...publicPorts,
                        [service.name]: publicPorts[service.name].filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                editPorts({
                  ...publicPorts,
                  [service.name]: [
                    ...(publicPorts[service.name] || []),
                    {
                      ...draftRow({
                        host: "0.0.0.0",
                        published: 8080,
                        target: 8080,
                        protocol: "tcp",
                      }),
                    },
                  ],
                })
              }
            >
              <Plus />
              Add port exception
            </Button>
          </section>
        ))}
        <Button disabled={busy || !ports} onClick={() => void save(true)}>
          Save published ports
        </Button>
      </CardContent>
    </Card>
  );
}
