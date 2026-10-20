import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionKeys } from "@/lib/query-keys";

import { disableTOTP } from "../services";

export function useDisableTOTP() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: disableTOTP,
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
