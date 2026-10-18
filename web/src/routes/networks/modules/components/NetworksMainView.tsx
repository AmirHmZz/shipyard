import { NetworkServerFilter } from "./NetworkServerFilter";
import { useDockerNetworks, useRemoveNetwork } from "../hooks";
import {
  Confirm,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
} from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  errorMessage,
  text,
  useAccount,
  useResources,
  type Resource,
} from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { indexResources } from "@/lib/resource-index";
import { Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DockerNetwork } from "../generics";
import { subnets } from "../utils";

export function NetworksMainView() {
  const changes = useConfigurationChanges();
  const q = useResources();
  const account = useAccount();
  const navigate = useNavigate();
  const removeMutation = useRemoveNetwork();
  const [remove, setRemove] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const inventory = useDockerNetworks(filter, !!filter && !!account?.admin);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const { byId } = indexResources(resources);
  const networks = resources.filter(
    (r) => r.kind === "network" && (!filter || r.data.serverId === filter),
  );
  const inventoryRows = inventory.data || [];
  const byDockerId = new Map<
    string,
    { network: DockerNetwork; order: number }
  >();
  const byLabel = new Map<string, { network: DockerNetwork; order: number }>();
  inventoryRows.forEach((network, order) => {
    if (!byDockerId.has(network.Id))
      byDockerId.set(network.Id, { network, order });
    const label = network.Labels?.["shipyard.network"];
    if (label && !byLabel.has(label)) byLabel.set(label, { network, order });
  });
  const registered = new Set<string>();
  const rows = networks.map((resource) => {
    const byId = byDockerId.get(String(resource.data.dockerId || "")),
      label = byLabel.get(resource.id);
    const docker =
      byId && label
        ? byId.order < label.order
          ? byId.network
          : label.network
        : byId?.network || label?.network;
    if (docker) registered.add(docker.Id);
    return { id: resource.id, name: resource.name, resource, docker };
  });
  const unregistered = inventoryRows.filter(
    (network) => !registered.has(network.Id),
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
      <NetworkServerFilter
        filter={filter}
        setFilter={setFilter}
        resources={resources}
        account={account}
        inventory={inventory}
      />
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
              {rows.map(({ resource: r, docker }) => {
                const addresses = subnets(docker);
                return (
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
                          {byId.get(String(r.data.ingressApp))?.name ||
                            "Application"}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      {byId.get(String(r.data.serverId))?.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(addresses.length
                        ? addresses
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
                );
              })}
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
                    <TableCell>{byId.get(filter)?.name}</TableCell>
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
          await removeMutation.mutateAsync(remove!.id);
          changes.saved();
        }}
      />
    </>
  );
}
