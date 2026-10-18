import {
  ConfigurationGuard,
  ConfigurationPage,
} from "@/components/configuration-surface";
import { GitConnection } from "@/components/git-connection";
import { Grants } from "@/components/grants";
import { HAProxySettings } from "@/components/haproxy-settings";
import { ResourceForm } from "@/components/resource-editor";
import { ErrorState, Loading, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Variables } from "@/components/variables";
import { useResources, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { NetworkForm } from "@/pages/networks";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
export function Configuration() {
  return (
    <ConfigurationPage>
      <ConfigurationGuard>
        <ConfigurationBody />
      </ConfigurationGuard>
    </ConfigurationPage>
  );
}
function ConfigurationBody() {
  const changes = useConfigurationChanges();
  const { kind, id = "new" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const q = useResources();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (kind === "network")
    return <NetworkForm key={location.pathname + location.search} />;
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
    changes.discard();
    navigate(back.startsWith("/") && !back.startsWith("//") ? back : fallback);
  };
  if (id !== "new" && !resource) return <p>Resource not found.</p>;
  const saved = (r: Resource) => {
    changes.saved();
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
      <Breadcrumb aria-label="Configuration navigation" className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={back}>Workspace</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="[overflow-wrap:anywhere]">
              {resource?.name || `New ${kind}`}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {kind === "haproxy" && resource ? (
        <HAProxySettings
          key={location.pathname}
          server={resource}
          onOpenChange={(open) => !open && close()}
        />
      ) : kind === "source-control" ? (
        <GitConnection
          key={location.pathname}
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
            description="Runtime variables and write-only secrets. Redeploy to apply changes."
          />
          <Variables key={resource.id} resource={resource} />
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
        <ResourceForm
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
