import type { MutationFunctionContext } from "@tanstack/react-query";

import type { Deployment } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { deploymentKeys } from "@/lib/query-keys";
import { jobResponseSchema } from "@/lib/schemas/acknowledgements";

import type { RemovedDeploymentSnapshot } from "../generics";

import { applicationKeys } from "../generics";

export function deploymentRemovalPolicy() {
  return {
    mutationKey: applicationKeys.deploymentRemoval,
    onMutate: async (id: string, context: MutationFunctionContext) => {
      const queryKey = applicationKeys.deployment(id);
      await Promise.all([
        context.client.cancelQueries({ queryKey: deploymentKeys.all }),
        context.client.cancelQueries({ queryKey }),
      ]);
      const lists = context.client.getQueriesData<Deployment[]>({
        queryKey: deploymentKeys.all,
      });
      const selected = context.client.getQueryData<Deployment>(queryKey);
      context.client.setQueriesData<Deployment[]>(
        { queryKey: deploymentKeys.all },
        (current) =>
          current?.map((deployment) =>
            deployment.id === id
              ? { ...deployment, deleting: true, deletionError: "" }
              : deployment,
          ),
      );
      context.client.setQueryData<Deployment>(queryKey, (current) =>
        current ? { ...current, deleting: true, deletionError: "" } : current,
      );
      return { lists, selected };
    },
    onError: (
      _error: unknown,
      id: string,
      snapshot: RemovedDeploymentSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (!snapshot) return;
      for (const [queryKey, list] of snapshot.lists) {
        const previous = list?.find((deployment) => deployment.id === id);
        if (!previous) continue;
        context.client.setQueryData<Deployment[]>(queryKey, (current) =>
          current?.map((deployment) =>
            deployment.id === id
              ? {
                  ...deployment,
                  deleting: previous.deleting,
                  deletionError: previous.deletionError,
                }
              : deployment,
          ),
        );
      }
      const selected = snapshot.selected;
      if (selected)
        context.client.setQueryData<Deployment>(
          applicationKeys.deployment(id),
          (current) =>
            current
              ? {
                  ...current,
                  deleting: selected.deleting,
                  deletionError: selected.deletionError,
                }
              : current,
        );
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      _id: string,
      _snapshot: RemovedDeploymentSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (
        context.client.isMutating({
          mutationKey: applicationKeys.deploymentRemoval,
        }) === 1
      )
        return Promise.all([
          context.client.invalidateQueries({ queryKey: deploymentKeys.all }),
          context.client.invalidateQueries({
            queryKey: applicationKeys.deploymentPrefix,
          }),
          context.client.invalidateQueries({
            queryKey: applicationKeys.releasesPrefix,
          }),
        ]);
    },
  };
}
export function useRemoveDeployment(_applicationId: string) {
  return useApiMutation({
    ...deploymentRemovalPolicy(),
    method: "DELETE",
    path: (deploymentId: string) => apiPath`/deployments/${deploymentId}`,
    schema: jobResponseSchema,
    meta: { successMessage: "Deployment cleanup queued" },
  });
}
