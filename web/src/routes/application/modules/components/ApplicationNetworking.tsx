import type { Resource } from "@/lib/api/types";

import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useApplicationNetworkingPage } from "../hooks";
import { ActiveContainerAddresses } from "./ActiveContainerAddresses";
import { ConfigurationScope } from "./ConfigurationScope";
import { PublishedPorts } from "./PublishedPorts";
import { ServiceNetworking } from "./ServiceNetworking";
export type ApplicationNetworkingProps = { app: Resource };
export function ApplicationNetworking({ app }: ApplicationNetworkingProps) {
  const page = useApplicationNetworkingPage(app);
  const { ports } = page.state;
  const { q, services, account, busy, error, publicPorts } = page.derived;
  const { editPorts, save } = page.handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <ConfigurationScope name="networking">
      <div className="flex flex-col gap-6">
        <ServiceNetworking app={app} page={page} />
        {!!q.data?.endpoints?.length && (
          <ActiveContainerAddresses endpoints={q.data.endpoints} />
        )}
        {account?.admin && app.data.workload !== "job" && (
          <ConfigurationScope name="published-ports">
            <PublishedPorts
              services={services}
              publicPorts={publicPorts}
              editPorts={editPorts}
              busy={busy}
              ports={ports}
              save={save}
            />
          </ConfigurationScope>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </ConfigurationScope>
  );
}
