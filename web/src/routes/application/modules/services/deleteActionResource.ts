import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function deleteActionResource(confirmAction: string) {
  return api<unknown>(apiPath`/resources/${confirmAction.split(":")[1]}`, {
    method: "DELETE",
    body: "{}",
  });
}
