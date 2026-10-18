import { api } from "@/lib/api/client";
import type { Instance } from "../generics";

export async function getGiteaInstances(_provider: string) {
  return api<Instance[]>("/git/gitea/instances");
}
