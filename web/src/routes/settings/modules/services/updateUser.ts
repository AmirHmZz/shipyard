import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function updateUser(
  userId: string | undefined,
  payload: { admin: boolean | undefined; disabled: boolean | undefined },
) {
  return api<unknown>(apiPath`/users/${String(userId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
