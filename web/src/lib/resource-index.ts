import type { Resource } from "./api";

export function indexResources(resources: readonly Resource[]) {
  const byId = new Map<string, Resource>();
  const byParent = new Map<string, Resource[]>();
  const byKind = new Map<string, Resource[]>();
  for (const resource of resources) {
    byId.set(resource.id, resource);
    const children = byParent.get(resource.parentId ?? "");
    if (children) children.push(resource);
    else byParent.set(resource.parentId ?? "", [resource]);
    const kind = byKind.get(resource.kind);
    if (kind) kind.push(resource);
    else byKind.set(resource.kind, [resource]);
  }
  return { byId, byParent, byKind };
}
