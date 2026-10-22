import type { MutationFunctionContext } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { dockerNetworkKeys, resourceKeys } from "@/lib/query-keys";
import { deletionResponseSchema } from "@/lib/schemas/acknowledgements";

import type { DockerNetwork, RemovedNetworkSnapshot } from "../generics";

import { networkKeys } from "../generics";

export function networkRemovalPolicy() {
  return {
    mutationKey: networkKeys.removal,
    onMutate: async (id: string, context: MutationFunctionContext) => {
      await Promise.all([
        context.client.cancelQueries({ queryKey: resourceKeys.all }),
        context.client.cancelQueries({ queryKey: dockerNetworkKeys.all }),
      ]);
      const resources = context.client.getQueryData<Resource[]>(
        resourceKeys.all,
      );
      const removed = resources?.find((resource) => resource.id === id);
      const inventories = context.client.getQueriesData<DockerNetwork[]>({
        queryKey: dockerNetworkKeys.all,
      });
      context.client.setQueryData<Resource[]>(resourceKeys.all, (current) =>
        current?.filter((resource) => resource.id !== id),
      );
      if (removed?.data.managed) {
        context.client.setQueriesData<DockerNetwork[]>(
          { queryKey: dockerNetworkKeys.all },
          (current) =>
            current?.filter(
              (network) =>
                network.Id !== removed.data.dockerId &&
                network.Labels["shipyard.network"] !== id,
            ),
        );
      }
      return { resources, removed, inventories };
    },
    onError: (
      _error: unknown,
      id: string,
      snapshot: RemovedNetworkSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      const removed = snapshot?.removed;
      const previous = snapshot?.resources;
      if (!snapshot || !removed || !previous) return;
      context.client.setQueryData<Resource[]>(resourceKeys.all, (current) => {
        if (!current) return previous;
        if (current.some((resource) => resource.id === id)) return current;
        const anchor = previous
          .slice(previous.indexOf(removed) + 1)
          .find((resource) => current.some((row) => row.id === resource.id));
        const position = current.findIndex(
          (resource) => resource.id === anchor?.id,
        );
        const restored = [...current];
        restored.splice(position < 0 ? restored.length : position, 0, removed);
        return restored;
      });
      if (!removed.data.managed) return;
      for (const [queryKey, inventory] of snapshot.inventories) {
        if (!inventory) continue;
        context.client.setQueryData<DockerNetwork[]>(queryKey, (current) => {
          if (!current) return inventory;
          const restored = [...current];
          for (const network of inventory) {
            if (
              (network.Id !== removed.data.dockerId &&
                network.Labels["shipyard.network"] !== id) ||
              restored.some((row) => row.Id === network.Id)
            )
              continue;
            const anchor = inventory
              .slice(inventory.indexOf(network) + 1)
              .find((candidate) =>
                restored.some((row) => row.Id === candidate.Id),
              );
            const position = restored.findIndex((row) => row.Id === anchor?.Id);
            restored.splice(
              position < 0 ? restored.length : position,
              0,
              network,
            );
          }
          return restored;
        });
      }
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      _id: string,
      _snapshot: RemovedNetworkSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (context.client.isMutating({ mutationKey: networkKeys.removal }) === 1)
        return Promise.all([
          context.client.invalidateQueries({ queryKey: resourceKeys.all }),
          context.client.invalidateQueries({ queryKey: dockerNetworkKeys.all }),
        ]);
    },
  };
}

export function useRemoveNetwork() {
  return useApiMutation({
    ...networkRemovalPolicy(),
    method: "DELETE",
    path: (id: string) => apiPath`/resources/${id}`,
    body: () => ({}),
    schema: deletionResponseSchema,
  });
}
