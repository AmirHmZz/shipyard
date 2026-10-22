import { useState } from "react";

import type { Resource } from "@/lib/api/types";

import { text } from "@/lib/resource-fields";

import { useDomainStatus } from "./useDomainStatus";
import { useSyncRoute } from "./useSyncRoute";
export function useRouteCard(route: Resource) {
  function retrySync() {
    return void sync("");
  }
  function adoptRecords() {
    return void sync("adopt");
  }
  function replaceRecords() {
    return setReplace(true);
  }
  function confirmReplacement() {
    return sync("replace");
  }

  const q = useDomainStatus(route);
  const [replace, setReplace] = useState(false);
  const synchronize = useSyncRoute(route.id);
  const syncing = synchronize.isPending;
  function sync(mode: string) {
    if (syncing) return;
    synchronize.mutate({ mode }, { onSuccess: () => setReplace(false) });
  }

  let protocol = "HTTPS";
  if (text(route.data, "protocol") === "tcp") protocol = "TCP";
  if (text(route.data, "protocol") === "grpc") protocol = "gRPC";
  return {
    state: { replace },
    derived: { q, syncing, protocol },
    handlers: {
      retrySync,
      adoptRecords,
      replaceRecords,
      confirmReplacement,
      setReplace,
    },
  };
}
