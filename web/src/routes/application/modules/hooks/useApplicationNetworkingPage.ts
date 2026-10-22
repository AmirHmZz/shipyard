import { useMemo, useState } from "react";

import type { Resource } from "@/lib/api/types";
import type { DraftRow } from "@/lib/draft-rows";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow, withoutRowId } from "@/lib/draft-rows";
import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import type { Service, Port } from "../generics";

import {
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "../generics";
import { useApplicationNetworking } from "./useApplicationNetworking";
import { useApplicationServices } from "./useApplicationServices";
import { useSaveApplicationNetworking } from "./useSaveApplicationNetworking";
export function useApplicationNetworkingPage(app: Resource) {
  const networkingChanges = useConfigurationChanges("networking");
  const portChanges = useConfigurationChanges("published-ports");
  const q = useApplicationNetworking(app);
  const services = useApplicationServices(app);
  const networks = useResources();
  const account = useAccount();
  const saveNetworking = useSaveApplicationNetworking(app.id);
  const [draft, setDraft] = useState<Record<string, Service> | null>(null);
  const [ports, setPorts] = useState<Record<string, DraftRow<Port>[]> | null>(
    null,
  );
  const busy = saveNetworking.isPending;
  const error = saveNetworking.error ? describeError(saveNetworking.error) : "";
  const saved = saveNetworking.isSuccess;
  const savedServices = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(q.data?.services || {}).map(([name, service]) => [
          name,
          { ...service, connections: service.connections.map(draftRow) },
        ]),
      ),
    [q.data?.services],
  );
  const savedPorts = useMemo(() => {
    const parsed = publishedPortsPayloadSchema.shape.services.safeParse(
      app.data.publishedPorts,
    );
    return Object.fromEntries(
      Object.entries(parsed.success ? parsed.data : {}).map(([name, ports]) => [
        name,
        ports.map(draftRow),
      ]),
    );
  }, [app.data.publishedPorts]);
  const value = draft || savedServices;
  const publicPorts = ports || savedPorts;
  function update(service: string, next: Partial<Service>) {
    networkingChanges.change();
    setDraft((current) => {
      const base = current ?? savedServices;
      return {
        ...base,
        [service]: { ...(base[service] || { connections: [] }), ...next },
      };
    });
  }
  function editPorts(next: Record<string, DraftRow<Port>[]>) {
    portChanges.change();
    setPorts(next);
  }
  function save(published = false) {
    if (busy) return;
    saveNetworking.reset();
    const parsed = (
      published ? publishedPortsPayloadSchema : networkingPayloadSchema
    ).safeParse({
      version: app.version,
      services: published
        ? Object.fromEntries(
            Object.entries(publicPorts).map(([name, ports]) => [
              name,
              ports.map(withoutRowId),
            ]),
          )
        : Object.fromEntries(
            Object.entries(value).map(([name, service]) => [
              name,
              {
                ...service,
                connections: service.connections.map(withoutRowId),
              },
            ]),
          ),
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveNetworking.mutate(
      { published, payload: parsed.data },
      {
        onSuccess: () => {
          (published ? portChanges : networkingChanges).saved();
          if (published) setPorts(null);
          else setDraft(null);
        },
      },
    );
  }

  const serviceRows = (services.data || []).map((service) => ({
    service,
    state: value[service.name] || { connections: [] },
  }));
  const ignoredServices = (services.data || [])
    .filter((service) => service.ignoredPorts)
    .map((service) => service.name)
    .join(", ");
  function refreshServices() {
    void services.refetch();
  }
  function saveNetworks() {
    save();
  }
  return {
    state: { draft, ports },
    derived: {
      q,
      services,
      networks,
      account,
      busy,
      error,
      saved,
      publicPorts,
      serviceRows,
      ignoredServices,
    },
    handlers: { update, editPorts, save, saveNetworks, refreshServices },
  };
}
