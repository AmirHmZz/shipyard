import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsKeys } from "../generics";
import { updateUser } from "../services";

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      access,
    }: {
      id: string | undefined;
      access: { admin: boolean | undefined; disabled: boolean | undefined };
    }) => updateUser(id, access),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsKeys.users }),
  });
}
