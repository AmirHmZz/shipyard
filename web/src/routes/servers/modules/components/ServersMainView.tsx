import { Plus, Server, Wrench } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { Grants } from "@/components/grants";
import {
  Confirm,
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useAccount, useResources, type Resource } from "@/lib/api";

import { useProvisionServer } from "../hooks";
import { ServerCard } from "./ServerCard";

export function ServersMainView() {
  const provisionMutation = useProvisionServer();
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const openServer = (server?: Resource) =>
    navigate(`/configure/server/${server?.id || "new"}?return=/servers`);
  const [grants, setGrants] = useState<Resource | null>(null);
  const [provision, setProvision] = useState<Resource | null>(null);
  const [filter, setFilter] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const servers = resources.filter(
    (r) =>
      r.kind === "server" &&
      r.name.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Independent Docker hosts, connected securely over SSH. No cluster required."
      >
        <Button disabled={!account?.admin} onClick={() => openServer()}>
          <Plus />
          Connect server
        </Button>
      </PageHeader>
      <div className="mb-6">
        <Filter value={filter} onChange={setFilter} />
      </div>
      {servers.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <div key={server.id}>
              <ServerCard
                server={server}
                onEdit={() => openServer(server)}
                onGrants={() =>
                  navigate(`/configure/access/${server.id}?return=/servers`)
                }
                onHAProxy={() =>
                  navigate(`/configure/haproxy/${server.id}?return=/servers`)
                }
                onDelete={() => navigate(`/servers/${server.id}/delete`)}
              />
              {server.data.connection !== "local" && !server.data.deleting && (
                <Button
                  className="mt-2"
                  disabled={!server.canWrite}
                  variant="ghost"
                  size="sm"
                  onClick={() => setProvision(server)}
                >
                  <Wrench />
                  Provision missing prerequisites
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Connect your first server"
          description="Add a Linux host, verify its SSH fingerprint, then let Shipyard prepare Docker and HAProxy."
          icon={<Server />}
          action={
            <Button disabled={!account?.admin} onClick={() => openServer()}>
              <Plus />
              Connect server
            </Button>
          }
        />
      )}
      <Dialog open={!!grants} onOpenChange={(v) => !v && setGrants(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Team access · {grants?.name}</DialogTitle>
            <DialogDescription>
              Infrastructure stays private until explicitly granted.
            </DialogDescription>
          </DialogHeader>
          {grants && <Grants resource={grants} resources={resources} />}
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!provision}
        onOpenChange={(v) => !v && setProvision(null)}
        title="Prepare this server?"
        description="Shipyard will use root SSH access to install missing Docker/Compose prerequisites and create its managed directories on this Debian/Ubuntu server."
        onConfirm={async () => {
          await provisionMutation.mutateAsync(provision?.id);
          toast.success("Provisioning queued. Track it in Settings → Jobs.");
        }}
      />
    </>
  );
}
