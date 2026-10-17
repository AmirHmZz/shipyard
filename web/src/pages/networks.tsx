import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@/lib/schema";
import {
  api,
  useAccount,
  useResources,
  text,
  errorMessage,
  type Resource,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Confirm,
  PageHeader,
  Loading,
  ErrorState,
  Empty,
} from "@/components/shared";
import { Plus, RefreshCw, Server, Trash2, Users } from "lucide-react";
type DockerNetwork = components["schemas"]["DockerNetwork"];
function subnets(network?: DockerNetwork) {
  const config = network?.IPAM?.Config;
  return Array.isArray(config)
    ? config
        .map((entry) => entry.Subnet)
        .filter((value): value is string => typeof value === "string")
    : [];
}
export function Networks() {
  const q = useResources();
  const account = useAccount();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [remove, setRemove] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const inventory = useQuery({
    queryKey: ["docker-networks", filter],
    queryFn: () => api<DockerNetwork[]>(`/servers/${filter}/networks`),
    enabled: !!filter && !!account?.admin,
    retry: false,
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const networks = resources.filter(
    (r) => r.kind === "network" && (!filter || r.data.serverId === filter),
  );
  const rows = networks.map((resource) => ({
    id: resource.id,
    name: resource.name,
    resource,
    docker: inventory.data?.find(
      (network) =>
        network.Id === resource.data.dockerId ||
        network.Labels?.["shipyard.network"] === resource.id,
    ),
  }));
  const unregistered = (inventory.data || []).filter(
    (network) => !rows.some((row) => row.docker?.Id === network.Id),
  );
  return (
    <>
      <PageHeader
        title="Docker networks"
        description="Manage bridge networks on your deployment servers. Application changes apply on the next deployment."
      >
        <Button
          disabled={!account?.admin}
          onClick={() =>
            navigate(
              `/configure/network/new?return=/networks${filter ? `&server=${filter}` : ""}`,
            )
          }
        >
          <Plus />
          Add network
        </Button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full space-y-2 sm:w-72">
          <Label htmlFor="network-server-filter">Server</Label>
          <Select
            value={filter || "all"}
            onValueChange={(v) => setFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger id="network-server-filter" className="w-full">
              <span className="flex min-w-0 items-center gap-2 text-left">
                <Server className="size-4 shrink-0 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">All servers</SelectItem>
              {resources
                .filter((r) => r.kind === "server")
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {filter && account?.admin && (
          <Button
            variant="outline"
            disabled={inventory.isFetching}
            onClick={() => void inventory.refetch()}
          >
            <RefreshCw className={inventory.isFetching ? "animate-spin" : ""} />
            Refresh networks
          </Button>
        )}
      </div>
      {inventory.isFetching && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Loading server networks…
        </p>
      )}
      {filter && inventory.error && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>
            Could not load server networks: {errorMessage(inventory.error)}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void inventory.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {rows.length || unregistered.length ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                {["Network", "Server", "Addresses", "Status", ""].map((v) => (
                  <TableHead key={v}>{v}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ resource: r, docker }) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.data.ingressApp
                        ? "Application ingress"
                        : r.data.managed
                          ? "Shipyard-managed"
                          : "External · attach only"}
                    </p>
                    {!!r.data.ingressApp && (
                      <Link
                        className="text-xs text-primary hover:underline"
                        to={`/applications/${text(r.data, "ingressApp")}`}
                      >
                        {resources.find((app) => app.id === r.data.ingressApp)
                          ?.name || "Application"}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    {resources.find((s) => s.id === r.data.serverId)?.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {(subnets(docker).length
                      ? subnets(docker)
                      : [text(r.data, "subnet"), text(r.data, "ipv6Subnet")]
                    )
                      .filter(Boolean)
                      .map((subnet) => (
                        <p key={subnet}>{subnet}</p>
                      ))}
                  </TableCell>
                  <TableCell>
                    {text(r.data, "status")}
                    <p className="text-xs text-destructive">
                      {text(r.data, "error")}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    {!r.data.ingressApp && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Network team access"
                          disabled={!account?.admin}
                          asChild
                        >
                          <Link
                            to={`/configure/access/${r.id}?return=/networks`}
                          >
                            <Users />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            r.data.managed
                              ? "Delete network"
                              : "Unregister network"
                          }
                          disabled={!account?.admin}
                          onClick={() => setRemove(r)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {unregistered.map((network) => {
                const register =
                  network.Driver === "bridge" &&
                  network.Name !== "bridge" &&
                  !network.Labels?.["shipyard.network"];
                return (
                  <TableRow key={network.Id}>
                    <TableCell>
                      <p className="font-medium">{network.Name}</p>
                      <p className="text-xs text-muted-foreground">
                        {network.Driver} ·{" "}
                        {network.Labels?.["shipyard.network"]
                          ? "Shipyard-managed"
                          : ["bridge", "host", "none"].includes(network.Name)
                            ? "Docker built-in"
                            : "Not registered"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {resources.find((server) => server.id === filter)?.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {subnets(network).map((subnet) => (
                        <p key={subnet}>{subnet}</p>
                      ))}
                    </TableCell>
                    <TableCell>Available</TableCell>
                    <TableCell className="text-right">
                      {register && (
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to={`/configure/network/new?${new URLSearchParams({ server: filter, dockerId: network.Id, name: network.Name, return: "/networks" })}`}
                          >
                            Register
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : !inventory.isFetching && !inventory.error ? (
        <Empty
          title={
            filter ? "No networks on this server" : "No registered networks"
          }
          description="Create a bridge network or register one already on your server."
        />
      ) : null}
      <Confirm
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title={
          remove?.data.managed
            ? "Delete Docker network?"
            : "Unregister external network?"
        }
        description="The network must not be referenced by applications or have attached containers. External Docker networks are preserved."
        destructive
        onConfirm={async () => {
          await api(`/resources/${remove!.id}`, {
            method: "DELETE",
            body: "{}",
          });
          await client.invalidateQueries({ queryKey: ["resources"] });
          await client.invalidateQueries({ queryKey: ["docker-networks"] });
          window.dispatchEvent(new Event("configuration-saved"));
        }}
      />
    </>
  );
}
export function NetworkForm() {
  const q = useResources();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const account = useAccount();
  const [server, setServer] = useState(params.get("server") || "");
  const [mode, setMode] = useState(
    params.has("dockerId") ? "existing" : "create",
  );
  const [name, setName] = useState(params.get("name") || "");
  const [selected, setSelected] = useState(params.get("dockerId") || "");
  const [subnet, setSubnet] = useState("");
  const [range, setRange] = useState("");
  const [v6, setV6] = useState(false);
  const [subnet6, setSubnet6] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inventory = useQuery({
    queryKey: ["docker-networks", server],
    queryFn: () =>
      api<
        {
          Id: string;
          Name: string;
          Driver: string;
          Labels: Record<string, string>;
        }[]
      >(`/servers/${server}/networks`),
    enabled: !!server && !!account?.admin,
    retry: false,
  });
  if (!account?.admin) return <p>Platform administrator access required.</p>;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add Docker network"
        description="Create a managed bridge or register an external bridge for team access."
      />
      <Card>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(`/servers/${server}/networks`, {
                  method: "POST",
                  body: JSON.stringify({
                    name,
                    dockerId: mode === "existing" ? selected : "",
                    subnet: mode === "create" ? subnet : "",
                    dynamicRange: range,
                    enableIPv6: v6,
                    ipv6Subnet: subnet6,
                  }),
                });
                await client.invalidateQueries({ queryKey: ["resources"] });
                await client.invalidateQueries({
                  queryKey: ["docker-networks"],
                });
                window.dispatchEvent(new Event("configuration-saved"));
                navigate("/networks");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="network-name">Name</Label>
              <Input
                id="network-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Server</Label>
              <Select
                value={server}
                onValueChange={(value) => {
                  setServer(value);
                  setSelected("");
                }}
              >
                <SelectTrigger className="w-full" aria-label="Network server">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {q.data
                    ?.filter((r) => r.kind === "server")
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger aria-label="Network source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Create managed bridge</SelectItem>
                <SelectItem value="existing">
                  Register existing bridge
                </SelectItem>
              </SelectContent>
            </Select>
            {mode === "existing" ? (
              <div className="space-y-2">
                <Label>Existing bridge</Label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger aria-label="Existing bridge">
                    <SelectValue
                      placeholder={
                        inventory.isFetching
                          ? "Loading networks…"
                          : "Select network"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory.data
                      ?.filter(
                        (n) =>
                          n.Driver === "bridge" &&
                          n.Name !== "bridge" &&
                          !n.Labels?.["shipyard.network"] &&
                          !q.data?.some(
                            (r) =>
                              r.kind === "network" && r.data.dockerId === n.Id,
                          ),
                      )
                      .map((n) => (
                        <SelectItem key={n.Id} value={n.Id}>
                          {n.Name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {inventory.error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errorMessage(inventory.error)}
                      <Button
                        type="button"
                        onClick={() => void inventory.refetch()}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="network-subnet">IPv4 subnet (optional)</Label>
                  <Input
                    id="network-subnet"
                    value={subnet}
                    onChange={(e) => setSubnet(e.target.value)}
                    placeholder="Automatic non-overlapping /24"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="network-range">
                    Dynamic IP range (optional)
                  </Label>
                  <Input
                    id="network-range"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    placeholder="Upper half of the subnet by default"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fixed reservations use addresses outside this range.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="network-v6">Enable IPv6</Label>
                  <Switch
                    id="network-v6"
                    checked={v6}
                    onCheckedChange={setV6}
                  />
                </div>
                {v6 && (
                  <div className="space-y-2">
                    <Label htmlFor="network-subnet6">
                      IPv6 subnet (optional)
                    </Label>
                    <Input
                      id="network-subnet6"
                      value={subnet6}
                      onChange={(e) => setSubnet6(e.target.value)}
                      placeholder="Automatic private /64"
                    />
                  </div>
                )}
              </>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new Event("configuration-saved"));
                  navigate("/networks");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  busy || !server || !name || (mode === "existing" && !selected)
                }
              >
                Save network
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
