import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useResources, type Resource } from "@/lib/api";
import { ResourceEditor } from "@/components/resource-editor";
import { HAProxySettings } from "@/components/haproxy-settings";
import { GitConnection } from "@/components/git-connection";
import { Variables } from "@/components/variables";
import { Grants } from "@/pages/infrastructure";
import { Loading, PageHeader, ErrorState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { NetworkForm } from "@/pages/networks";
import { ConfigurationGuard } from "@/components/configuration-surface";
export function Configuration() {
  return (
    <ConfigurationGuard>
      <ConfigurationBody />
    </ConfigurationGuard>
  );
}
function ConfigurationBody() {
  const { kind, id = "new" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const q = useResources();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (kind === "network") return <NetworkForm />;
  const resources = q.data || [];
  const resource = resources.find((r) => r.id === id);
  const fallback =
    kind === "zone"
      ? "/dns"
      : kind === "application"
        ? "/projects"
        : kind === "route" && resource
          ? `/applications/${resource.parentId}`
          : kind === "server" || kind === "haproxy"
            ? "/servers"
            : "/integrations";
  const requestedBack = params.get("return") || fallback;
  const back =
    requestedBack.startsWith("/") &&
    !requestedBack.startsWith("//") &&
    !requestedBack.includes("\\")
      ? requestedBack
      : fallback;
  const close = () => {
    window.dispatchEvent(new Event("configuration-saved"));
    navigate(back.startsWith("/") && !back.startsWith("//") ? back : fallback);
  };
  if (id !== "new" && !resource) return <p>Resource not found.</p>;
  const saved = (r: Resource) => {
    window.dispatchEvent(new Event("configuration-saved"));
    navigate(
      r.kind === "application"
        ? `/applications/${r.id}`
        : r.kind === "zone"
          ? `/dns/${r.id}`
          : back,
    );
  };
  return (
    <>
      <div className="mb-6 text-xs text-muted-foreground">
        <Link className="hover:text-foreground" to={back}>
          Workspace
        </Link>
        <span className="mx-2">/</span>
        {resource?.name || `New ${kind}`}
      </div>
      {kind === "haproxy" && resource ? (
        <HAProxySettings
          server={resource}
          onOpenChange={(open) => !open && close()}
        />
      ) : kind === "source-control" ? (
        <GitConnection
          existing={resource}
          onClose={close}
          onManual={() =>
            navigate(`/configure/git/${id}?return=${encodeURIComponent(back)}`)
          }
        />
      ) : kind === "variables" && resource ? (
        <>
          <PageHeader
            title={`${resource.name} variables`}
            description="Encrypted variables. Redeploy to apply changes."
          />
          <Variables resource={resource} />
          <Button variant="outline" onClick={close}>
            Back
          </Button>
        </>
      ) : kind === "access" && resource ? (
        <>
          <PageHeader
            title={`${resource.name} access`}
            description="Manage the teams that can use this resource."
          />
          <Grants resource={resource} resources={resources} />
        </>
      ) : (
        <ResourceEditor
          key={location.pathname}
          open
          kind={kind || "application"}
          existing={resource}
          parentId={params.get("parent") || undefined}
          resources={resources}
          onOpenChange={(open) => !open && close()}
          onSaved={saved}
        />
      )}
    </>
  );
}
