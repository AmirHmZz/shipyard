import { api } from "@/lib/api/client";
import type { AlertPolicy } from "../generics";

export async function getAlertPolicy() {
  return api<AlertPolicy>("/settings/alerts");
}
