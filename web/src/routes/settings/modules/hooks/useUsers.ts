import { useApiQuery } from "@/lib/api/use-api-query";

import { settingsKeys, getUsersResponseSchema } from "../generics";
export function useUsers() {
  return useApiQuery({
    queryKey: settingsKeys.users,
    path: "/users",
    schema: getUsersResponseSchema,
  });
}
