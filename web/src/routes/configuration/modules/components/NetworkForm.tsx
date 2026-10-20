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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { describeError } from "@/lib/api/translate-error";

import { useNetworkForm } from "../hooks";

export function NetworkForm() {
  const { state, derived, handlers } = useNetworkForm();
  const { server, mode, name, selected, subnet, range, v6, subnet6 } = state;
  const { q, account, inventory, busy, error, pendingNetwork } = derived;
  const {
    setServer,
    setMode,
    setName,
    setSelected,
    setSubnet,
    setRange,
    setV6,
    setSubnet6,
    cancel,
    submitNetwork,
  } = handlers;
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
              <Select value={server} onValueChange={setServer}>
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
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button
                disabled={
                  busy || !server || !name || (mode === "existing" && !selected)
                }
              >
                {busy && <Spinner />}Save network
              </Button>
            </div>
            {busy && (
              <p role="status" className="text-xs text-muted-foreground">
                Saving network {pendingNetwork?.name}…
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
