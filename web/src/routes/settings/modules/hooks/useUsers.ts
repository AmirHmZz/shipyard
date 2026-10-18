import { settingsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getUsers } from "../services";

export function useUsers() {
  return useQuery({
    queryKey: settingsKeys.users,
    queryFn: () => getUsers(),
  });
}
