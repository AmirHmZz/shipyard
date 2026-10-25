import { toast } from "sonner";

import type { Resource } from "@/lib/api/types";

import { useAdmin } from "@/lib/session";

import { useCheckDockerVersion } from "./useCheckDockerVersion";
import { useServerMetrics } from "./useServerMetrics";

export function useServerCard(server: Resource) {
  const admin = useAdmin();
  const q = useServerMetrics(server, admin);
  const latest = q.data?.at(-1);
  const checkVersion = useCheckDockerVersion(server.id);
  let status = "pending";
  if (latest) status = latest.online ? "online" : "offline";
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
