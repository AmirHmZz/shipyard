import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dockerNetworkKeys, resourceKeys } from "@/lib/query-keys";
import { removeNetwork } from "../services";

export function useRemoveNetwork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: removeNetwork,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: resourceKeys.all }),
        client.invalidateQueries({ queryKey: dockerNetworkKeys.all }),
      ]),
  });
}
