import { RefreshCw, Server } from "lucide-react";

import type { Resource } from "@/lib/api/types";
import type { useAccount } from "@/lib/session";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

import type { useDockerNetworks } from "../hooks";

export type NetworkServerFilterProps = {
  filter: string;
  setFilter: (value: string) => void;
  resources: Resource[];
  account: ReturnType<typeof useAccount>;
  inventory: ReturnType<typeof useDockerNetworks>;
};
export function NetworkServerFilter({
  filter,
  setFilter,
  resources,
  account,
  inventory,
}: NetworkServerFilterProps) {
  const servers = resources.filter((resource) => resource.kind === "server");
  const canRefresh = !!filter && !!account?.admin;
  function handleFilterChange(value: string) {
    setFilter(value === "all" ? "" : value);
  }
  function refreshNetworks() {
    void inventory.refetch();
  }
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="w-full flex flex-col gap-2 sm:w-72">
        <Label htmlFor="network-server-filter">Server</Label>
        <Select value={filter || "all"} onValueChange={handleFilterChange}>
          <SelectTrigger id="network-server-filter" className="w-full">
            <span className="flex min-w-0 items-center gap-2 text-left">
              <Server className="text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="all">All servers</SelectItem>
            {servers.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canRefresh && (
        <Button
          variant="outline"
          disabled={inventory.isFetching}
          onClick={refreshNetworks}
        >
          {inventory.isFetching ? (
            <Spinner className="size-4" />
          ) : (
            <RefreshCw />
          )}
          Refresh networks
        </Button>
      )}
    </div>
  );
}
