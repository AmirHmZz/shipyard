import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function removeNetwork(id: string) {
  return api<unknown>(apiPath`/resources/${id}`, {
    method: "DELETE",
    body: "{}",
  });
}
