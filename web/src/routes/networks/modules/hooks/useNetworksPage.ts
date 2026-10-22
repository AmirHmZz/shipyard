import type { MouseEvent } from "react";

import { useState } from "react";
import { useNavigate } from "react-router";

import type { Resource } from "@/lib/api/types";

import { useConfigurationChanges } from "@/lib/configuration-state";
import { useResources } from "@/lib/hooks/useResources";
import { indexResources } from "@/lib/resource-index";
import { useAccount } from "@/lib/session";

import { networkRows } from "../utils";
import { useDockerNetworks } from "./useDockerNetworks";
import { useRemoveNetwork } from "./useRemoveNetwork";

export function useNetworksPage() {
  const changes = useConfigurationChanges();
  const q = useResources();
  const account = useAccount();
  const navigate = useNavigate();
  const removeMutation = useRemoveNetwork();
  const [remove, setRemove] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const inventory = useDockerNetworks(filter, !!filter && !!account?.admin);
  const resources = q.data || [];
  const { byId } = indexResources(resources);
  const { rows, unregistered } = networkRows(
    resources,
    inventory.data || [],
    filter,
  );
  const hasRows = !!(rows.length || unregistered.length);
  const showEmpty = !inventory.isFetching && !inventory.error;
  const showInventoryError = !!filter && !!inventory.error;
  const removalTitle = remove?.data.managed
    ? "Delete Docker network?"
    : "Unregister external network?";
  const emptyTitle = filter
    ? "No networks on this server"
    : "No registered networks";
  function confirmRemoval() {
    if (!remove || removeMutation.isPending) return;
    removeMutation.mutate(remove.id, {
      onSuccess: () => {
        changes.saved();
        setRemove(null);
      },
    });
  }
  function handleRemovalOpenChange(open: boolean) {
    if (!open) setRemove(null);
  }
  function handleNetworkAction(event: MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-network-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const resource = byId.get(button.dataset.networkId || "");
    if (resource) setRemove(resource);
  }
  function addNetwork() {
    navigate(
      `/configure/network/new?return=/networks${filter ? `&server=${filter}` : ""}`,
    );
  }
  function refreshNetworks() {
    void inventory.refetch();
  }
  return {
    state: { remove, filter },
    derived: {
      q,
      account,
      resources,
      inventory,
      byId,
      rows,
      unregistered,
      hasRows,
      showEmpty,
      showInventoryError,
      removalTitle,
      emptyTitle,
      removeMutation,
    },
    handlers: {
      setFilter,
      confirmRemoval,
      handleRemovalOpenChange,
      handleNetworkAction,
      addNetwork,
      refreshNetworks,
    },
  };
}
