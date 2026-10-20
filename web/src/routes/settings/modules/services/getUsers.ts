import { api } from "@/lib/api/client";

import type { User } from "../generics";

export async function getUsers() {
  return api<User[]>("/users");
}
