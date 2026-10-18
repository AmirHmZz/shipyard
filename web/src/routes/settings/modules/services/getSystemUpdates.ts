import { api } from "@/lib/api/client";
import type { Status } from "../generics";

export async function getSystemUpdates() {
  return api<Status>("/settings/updates");
}
