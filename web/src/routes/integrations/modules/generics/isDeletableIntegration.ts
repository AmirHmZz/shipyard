import type { Resource } from "@/lib/api/types";

export function isDeletableIntegration(resource: Resource) {
  return (
    ["registry", "proxy", "webhook"].includes(resource.kind) ||
    (resource.kind === "git" && !!resource.teamId)
  );
}
