import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import type { Resource } from "@/lib/api/types";

import { useConfigurationChanges } from "@/lib/configuration-state";
import { useResources } from "@/lib/hooks/useResources";

function fallbackPath(
  kind: string | undefined,
  resource: Resource | undefined,
) {
  if (kind === "zone") return "/dns";
  if (kind === "application") return "/projects";
  if (kind === "route" && resource) return `/applications/${resource.parentId}`;
  if (kind === "server" || kind === "haproxy") return "/servers";
  return "/integrations";
}
export function useConfigurationPage() {
  const changes = useConfigurationChanges();
  const { kind, id = "new" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const q = useResources();
  const resources = q.data || [];
  const resource = resources.find((resource) => resource.id === id);
  const fallback = fallbackPath(kind, resource);
  const requestedBack = params.get("return") || fallback;
  const back =
    requestedBack.startsWith("/") &&
    !requestedBack.startsWith("//") &&
    !requestedBack.includes("\\")
      ? requestedBack
      : fallback;
  const parentId = params.get("parent") || undefined;
  function close() {
    changes.discard();
    navigate(back.startsWith("/") && !back.startsWith("//") ? back : fallback);
  }
  function saved(resource: Resource) {
    changes.saved();
    if (resource.kind === "application") {
      navigate(`/applications/${resource.id}`);
      return;
    }
    if (resource.kind === "zone") {
      navigate(`/dns/${resource.id}`);
      return;
    }
    navigate(back);
  }
  function handleOpenChange(open: boolean) {
    if (!open) close();
  }
  function manualCredentials() {
    navigate(`/configure/git/${id}?return=${encodeURIComponent(back)}`);
  }
  return {
    state: {},
    derived: { q, kind, id, location, resources, resource, back, parentId },
    handlers: { close, saved, handleOpenChange, manualCredentials },
  };
}
