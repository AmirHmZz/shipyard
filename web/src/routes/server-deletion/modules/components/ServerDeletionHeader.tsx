import { Link } from "react-router";

import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { type Resource } from "@/lib/api";

import type { Status } from "../generics";

export function ServerDeletionHeader({
  server,
  operation,
}: {
  server?: Resource;
  operation?: Status;
}) {
  return (
    <PageHeader
      breadcrumbs={[
        { label: "Servers", to: "/servers" },
        { label: server?.name || operation?.plan.serverName || "Server" },
        { label: operation ? "Cleanup" : "Delete" },
      ]}
      title={
        operation?.done
          ? "Server deleted"
          : `Delete ${server?.name || operation?.plan.serverName || "server"}`
      }
      description="Review and permanently remove this server's Shipyard-managed resources."
    >
      <Button variant="outline" asChild>
        <Link to="/servers">Back to servers</Link>
      </Button>
    </PageHeader>
  );
}
