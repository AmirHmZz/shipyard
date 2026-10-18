import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deploymentKeys } from "@/lib/query-keys";
import { applicationKeys } from "../generics";
import { removeDeployment } from "../services";

export function useRemoveDeployment(applicationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: removeDeployment,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: deploymentKeys.all }),
        client.invalidateQueries({
          queryKey: applicationKeys.releases(applicationId),
        }),
      ]),
  });
}
