import type * as React from "react";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { PageHeader } from "@/components/Shared";
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
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setName(e.target.value);
  }
  function handleButtonClick() {
    return void inventory.refetch();
  }
  function handleInputChange2(e: React.ChangeEvent<HTMLInputElement>) {
    return setSubnet(e.target.value);
  }
  function handleInputChange3(e: React.ChangeEvent<HTMLInputElement>) {
    return setRange(e.target.value);
  }
  function handleInputChange4(e: React.ChangeEvent<HTMLInputElement>) {
    return setSubnet6(e.target.value);
  }

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
          <form className="flex flex-col gap-5" onSubmit={submitNetwork}>
            <InputField
              label={<>Name</>}
              labelProps={{ htmlFor: "network-name" }}
              inputProps={{
                id: "network-name",
                value: name,
                onChange: handleInputChange,
                required: true,
              }}
            />
            <FormField label={<>Server</>} labelProps={{}}>
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
            </FormField>
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
              <FormField label={<>Existing bridge</>} labelProps={{}}>
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
                      <Button type="button" onClick={handleButtonClick}>
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </FormField>
            ) : (
              <>
                <InputField
                  label={<>IPv4 subnet (optional)</>}
                  labelProps={{ htmlFor: "network-subnet" }}
                  inputProps={{
                    id: "network-subnet",
                    value: subnet,
                    onChange: handleInputChange2,
                    placeholder: "Automatic non-overlapping /24",
                  }}
                />
                <FormField
                  label={<>Dynamic IP range (optional)</>}
                  labelProps={{ htmlFor: "network-range" }}
                >
                  <Input
                    id="network-range"
                    value={range}
                    onChange={handleInputChange3}
                    placeholder="Upper half of the subnet by default"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fixed reservations use addresses outside this range.
                  </p>
                </FormField>
                <div className="flex items-center justify-between">
                  <Label htmlFor="network-v6">Enable IPv6</Label>
                  <Switch
                    id="network-v6"
                    checked={v6}
                    onCheckedChange={setV6}
                  />
                </div>
                {v6 && (
                  <InputField
                    label={<>IPv6 subnet (optional)</>}
                    labelProps={{ htmlFor: "network-subnet6" }}
                    inputProps={{
                      id: "network-subnet6",
                      value: subnet6,
                      onChange: handleInputChange4,
                      placeholder: "Automatic private /64",
                    }}
                  />
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
