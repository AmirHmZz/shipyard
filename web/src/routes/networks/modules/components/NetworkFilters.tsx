import type { ChangeEvent } from "react";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { FlushCard } from "@/components/FlushCard";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { useNetworksPage } from "../hooks";

import { NetworkServerFilter } from "./NetworkServerFilter";

export type NetworkFiltersProps = {
  controller: ReturnType<typeof useNetworksPage>;
};

export function NetworkFilters({ controller }: NetworkFiltersProps) {
  const { filter, search, type, status } = controller.state;
  const { account, resources, inventory, statuses, filtered, visible, total } =
    controller.derived;
  const { setFilter, setSearch, setType, setStatus, clearFilters } =
    controller.handlers;
  function searchNetworks(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.currentTarget.value);
  }
  return (
    <FlushCard className="mb-5">
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="network-search">Search networks</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="network-search"
              className="pl-9"
              value={search}
              onChange={searchNetworks}
              placeholder="Name, server, ID or subnet…"
            />
          </div>
        </div>
        <NetworkServerFilter
          filter={filter}
          setFilter={setFilter}
          resources={resources}
          account={account}
          inventory={inventory}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="network-type">Network type</Label>
          <SelectControl
            value={type}
            onValueChange={setType}
            triggerProps={{ id: "network-type", className: "w-full" }}
            options={[
              { value: "all", label: "All types" },
              { value: "managed", label: "Shipyard-managed" },
              { value: "external", label: "External" },
              { value: "ingress", label: "Application ingress" },
              { value: "unregistered", label: "Not registered" },
              { value: "builtin", label: "Docker built-in" },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="network-status">Status</Label>
          <SelectControl
            value={status}
            onValueChange={setStatus}
            triggerProps={{
              id: "network-status",
              className: "w-full capitalize",
            }}
            options={[
              { value: "all", label: "All statuses" },
              ...statuses.map((value) => ({
                value,
                label: value.replaceAll("_", " "),
              })),
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-2.5">
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          Showing {visible} of {total} networks
        </p>
        {filtered || filter ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear filters
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a server to discover Docker networks.
          </p>
        )}
      </div>
    </FlushCard>
  );
}
