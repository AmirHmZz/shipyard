import { Link } from "react-router";

import { ErrorState, Loading } from "@/components/Shared";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { useConfigurationPage } from "../hooks";
import { ConfigurationContent } from "./ConfigurationContent";
import { NetworkForm } from "./NetworkForm";
export function ConfigurationBody() {
  const controller = useConfigurationPage();
  const { q, kind, id, location, resource, back } = controller.derived;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (kind === "network")
    return <NetworkForm key={location.pathname + location.search} />;
  if (id !== "new" && !resource) return <p>Resource not found.</p>;
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
      <ConfigurationContent controller={controller} />
    </>
  );
}
