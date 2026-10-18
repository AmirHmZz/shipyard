import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resourceKeys } from "@/lib/query-keys";
import { createApplicationPreview } from "../services";

export function useCreateApplicationPreview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sha }: { id: string; sha: unknown }) =>
      createApplicationPreview(id, { sha }),
    onSuccess: () => client.invalidateQueries({ queryKey: resourceKeys.all }),
  });
}
