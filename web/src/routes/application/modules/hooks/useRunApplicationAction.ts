import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applicationKeys } from "../generics";
import { runApplicationAction } from "../services";

export function useRunApplicationAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: string) => runApplicationAction(id, { action }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: applicationKeys.runtime(id) }),
  });
}
