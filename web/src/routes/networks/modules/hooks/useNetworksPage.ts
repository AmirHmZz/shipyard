import type { MouseEvent } from "react";

import { useState } from "react";
import { useNavigate } from "react-router";

import type { Resource } from "@/lib/api/types";

import { useConfigurationChanges } from "@/lib/configuration-state";
import { useResources } from "@/lib/hooks/useResources";
import { indexResources } from "@/lib/resource-index";
import { useAccount } from "@/lib/session";

import { attachmentInputSchema } from "../generics";
import { filterNetworkRows, networkRows } from "../utils";
import { useControlPlaneNetworks } from "./useControlPlaneNetworks";
import { useDockerNetworks } from "./useDockerNetworks";
import { useRemoveNetwork } from "./useRemoveNetwork";
import { useSaveControlPlaneNetwork } from "./useSaveControlPlaneNetwork";

export function useNetworksPage() {
  const changes = useConfigurationChanges();
  const q = useResources();
  const account = useAccount();
  const navigate = useNavigate();
  const removeMutation = useRemoveNetwork();
  const [remove, setRemove] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const inventory = useDockerNetworks(filter, !!filter && !!account?.admin);
  const resources = q.data || [];
  const hasLocalHost = resources.some(
    (resource) =>
      resource.kind === "server" && resource.data.connection === "local",
  );
  const controlNetworks = useControlPlaneNetworks(
    !!account?.admin && hasLocalHost,
  );
  const saveControlNetwork = useSaveControlPlaneNetwork();
  const controlById = new Map(
    controlNetworks.data?.networks.map((network) => [
      network.networkId,
      network,
    ]),
  );
  const { byId } = indexResources(resources);
  const available = networkRows(resources, inventory.data || [], filter);
  const { rows, unregistered } = filterNetworkRows(
    available,
    byId,
    { search, type, status },
    byId.get(filter)?.name,
  );
  const total = available.rows.length + available.unregistered.length;
  const visible = rows.length + unregistered.length;
  const statuses = Array.from(
    new Set([
      ...available.rows.map(({ resource }) =>
        String(resource.data.status || "unknown"),
      ),
      ...(available.unregistered.length ? ["available"] : []),
    ]),
  ).sort();
  const filtered = !!search || type !== "all" || status !== "all";
  const hasRows = !!(rows.length || unregistered.length);
  const showEmpty = !inventory.isFetching && !inventory.error;
  const showInventoryError = !!filter && !!inventory.error;
  const removalTitle = remove?.data.managed
    ? "Delete Docker network?"
    : "Unregister external network?";
  let emptyTitle = filter
    ? "No networks on this server"
    : "No registered networks";
  if (filtered) emptyTitle = "No matching networks";
  function clearFilters() {
    setSearch("");
    setType("all");
    setStatus("all");
    setFilter("");
  }
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
    const attachment = event.target.closest<HTMLButtonElement>(
      "button[data-control-plane-network-id]",
    );
    if (
      attachment &&
      !attachment.disabled &&
      event.currentTarget.contains(attachment)
    ) {
      const networkId = attachment.dataset.controlPlaneNetworkId;
      const attached = attachmentInputSchema.safeParse(
        attachment.dataset.attached,
      );
      if (networkId && attached.success && !saveControlNetwork.isPending) {
        saveControlNetwork.mutate({ networkId, attached: attached.data });
      }
      return;
    }
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
  function refreshControlNetworks() {
    void controlNetworks.refetch();
  }
  return {
    state: { remove, filter, search, type, status },
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
      controlNetworks,
      controlById,
      saveControlNetwork,
      total,
      visible,
      statuses,
      filtered,
    },
    handlers: {
      setFilter,
      setSearch,
      setType,
      setStatus,
      clearFilters,
      confirmRemoval,
      handleRemovalOpenChange,
      handleNetworkAction,
      addNetwork,
      refreshNetworks,
      refreshControlNetworks,
    },
  };
}
