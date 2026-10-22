import { Plus, Server } from "lucide-react";

import {
  Confirm,
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
} from "@/components/Shared";
import { Button } from "@/components/ui/button";

import { useServersPage } from "../hooks";
import { ServerEntry } from "./ServerEntry";
export function ServersMainView() {
  const { state, derived, handlers } = useServersPage();
  const { provision, filter } = state;
  const { account, q, servers, provisionMutation } = derived;
  const {
    setFilter,
    connectServer,
    confirmProvisioning,
    handleProvisionOpenChange,
    handleServerAction,
  } = handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Independent Docker hosts, connected securely over SSH. No cluster required."
      >
        <Button disabled={!account?.admin} onClick={connectServer}>
          <Plus />
          Connect server
        </Button>
      </PageHeader>
      <div className="mb-6">
        <Filter value={filter} onChange={setFilter} />
      </div>
      {servers.length ? (
        <div
          className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          onClick={handleServerAction}
        >
          {servers.map((server) => (
            <ServerEntry key={server.id} server={server} />
          ))}
        </div>
      ) : (
        <Empty
          title="Connect your first server"
          description="Add a Linux host, verify its SSH fingerprint, then let Shipyard prepare Docker and HAProxy."
          icon={<Server />}
          action={
            <Button disabled={!account?.admin} onClick={connectServer}>
              <Plus />
              Connect server
            </Button>
          }
        />
      )}
      <Confirm
        open={!!provision}
        onOpenChange={handleProvisionOpenChange}
        title="Prepare this server?"
        description="Shipyard will use root SSH access to install missing Docker/Compose prerequisites and create its managed directories on this Debian/Ubuntu server."
        pending={provisionMutation.isPending}
        onConfirm={confirmProvisioning}
      />
    </>
  );
}
