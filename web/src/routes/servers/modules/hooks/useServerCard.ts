import { toast } from "sonner";

import type { Resource } from "@/lib/api/types";

import { useAdmin } from "@/lib/session";

import { useCheckDockerVersion } from "./useCheckDockerVersion";
import { useServerMetrics } from "./useServerMetrics";
import { useServerStatus } from "./useServerStatus";

export function useServerCard(server: Resource) {
  const admin = useAdmin();
  const q = useServerMetrics(server, admin);
  const latest = q.data?.at(-1);
  const serverStatus = useServerStatus(server.id, !admin);
  const checkVersion = useCheckDockerVersion(server.id);
  const online = admin ? latest?.online : serverStatus.data?.online;
  const loading = admin ? q.isLoading : serverStatus.isLoading;
  let status = loading ? "pending" : "unknown";
  if (typeof online === "boolean") status = online ? "online" : "offline";
  function testConnection() {
    checkVersion.mutate(undefined, {
      onSuccess: (value) =>
        toast.success(`Connected · Docker ${value.dockerVersion}`),
    });
  }
  return {
    state: {},
    derived: { admin, q, latest, status },
    handlers: { testConnection },
  };
}
