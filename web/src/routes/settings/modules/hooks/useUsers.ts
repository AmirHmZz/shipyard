import { useQuery } from "@tanstack/react-query";

import { settingsKeys } from "../generics";
import { getUsers } from "../services";

export function useUsers() {
  return useQuery({
    queryKey: settingsKeys.users,
    queryFn: () => getUsers(),
  });
}
