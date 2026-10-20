import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { resourceKeys } from "@/lib/query-keys";

import { saveApplicationPreview } from "../services";

export function useSaveApplicationPreview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Pick<Resource, "kind" | "name" | "version" | "data">;
    }) => saveApplicationPreview(id, payload),
    onSuccess: () => client.invalidateQueries({ queryKey: resourceKeys.all }),
  });
}
