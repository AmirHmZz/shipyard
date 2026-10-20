import type { FormEvent } from "react";

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useResources } from "@/lib/api";
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useAccount } from "@/lib/session";

import { networkFormSchema } from "../generics";
import { useNetworkInventory, useCreateNetwork } from "../hooks";

export function NetworkForm() {
  const changes = useConfigurationChanges();
  const q = useResources();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const account = useAccount();
  const [server, setServer] = useState(() => params.get("server") || "");
  const [mode, setMode] = useState(() =>
    params.has("dockerId") ? "existing" : "create",
  );
  const [name, setName] = useState(() => params.get("name") || "");
  const [selected, setSelected] = useState(() => params.get("dockerId") || "");
  const [subnet, setSubnet] = useState("");
  const [range, setRange] = useState("");
  const [v6, setV6] = useState(false);
  const [subnet6, setSubnet6] = useState("");
  const createNetwork = useCreateNetwork(server);
  const busy = createNetwork.isPending;
  const error = createNetwork.error ? describeError(createNetwork.error) : "";
  const inventory = useNetworkInventory(server, !!account?.admin);
  function submitNetwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    createNetwork.reset();
    const parsed = networkFormSchema.safeParse({
      name,
      server,
      mode,
      selected,
      subnet,
      range,
      v6,
      subnet6,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    const values = parsed.data;
    createNetwork.mutate(
      {
        name: values.name,
        dockerId: values.mode === "existing" ? values.selected : "",
        subnet: values.mode === "create" ? values.subnet : "",
        dynamicRange: values.range,
        enableIPv6: values.v6,
        ipv6Subnet: values.subnet6,
      },
      {
        onSuccess: () => {
          changes.saved();
          navigate("/networks");
        },
      },
    );
  }
  if (!account?.admin) return <p>Platform administrator access required.</p>;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add Docker network"
        description="Create a managed bridge or register an external bridge for team access."
      />
      <Card>
        <CardContent>
          <form className="space-y-5" onSubmit={submitNetwork}>
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
                      {describeError(inventory.error)}
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
                  changes.discard();
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
