import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionKeys } from "@/lib/query-keys";
import { setMaintenanceMode } from "../services";

export function useSetMaintenanceMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setMaintenanceMode,
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
