import type { MouseEvent } from "react";

import { useState } from "react";
import { useNavigate } from "react-router";

import type { Resource } from "@/lib/api/types";

import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import { useProvisionServer } from "./useProvisionServer";
export function useServersPage() {
  const provisionMutation = useProvisionServer();
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const [provision, setProvision] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  const servers = (q.data || []).filter(
    (resource) =>
      resource.kind === "server" &&
      resource.name.toLowerCase().includes(filter.toLowerCase()),
  );
  function connectServer() {
    navigate("/configure/server/new?return=/servers");
  }
  function confirmProvisioning() {
    if (!provision || provisionMutation.isPending) return;
    provisionMutation.mutate(provision.id, {
      onSuccess: () => setProvision(null),
    });
  }
  function handleProvisionOpenChange(open: boolean) {
    if (!open) setProvision(null);
  }
  function handleServerAction(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-server-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const server = servers.find(
      (resource) => resource.id === button.dataset.serverId,
    );
    if (!server) return;
    switch (button.dataset.action) {
      case "edit":
        navigate("/configure/server/" + server.id + "?return=/servers");
        break;
      case "grants":
        navigate("/configure/access/" + server.id + "?return=/servers");
        break;
      case "haproxy":
        navigate("/configure/haproxy/" + server.id + "?return=/servers");
        break;
      case "delete":
        navigate("/servers/" + server.id + "/delete");
        break;
      case "provision":
        setProvision(server);
        break;
    }
  }
  return {
    state: { provision, filter },
    derived: { account, q, servers, provisionMutation },
    handlers: {
      setFilter,
      connectServer,
      confirmProvisioning,
      handleProvisionOpenChange,
      handleServerAction,
    },
  };
}
