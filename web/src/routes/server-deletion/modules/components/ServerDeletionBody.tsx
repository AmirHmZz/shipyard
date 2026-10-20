import { RefreshCw } from "lucide-react";

import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { useServerDeletionPage } from "../hooks";

import { ServerDeletionPlanReview } from "./ServerDeletionPlanReview";
import { ServerDeletionProgress } from "./ServerDeletionProgress";
export type ServerDeletionBodyProps = {
  id: string;
  controller: ReturnType<typeof useServerDeletionPage>;
};
export function ServerDeletionBody({
  id,
  controller,
}: ServerDeletionBodyProps) {
  const { name, ack, repair } = controller.state;
  const {
    server,
    deleting,
    status,
    plan,
    reviewing: busy,
    confirming,
    retrying,
  } = controller.derived;
  const {
    setName,
    setAck,
    setRepair,
    review,
    submitConfirmation,
    retryCleanup,
  } = controller.handlers;
  const operation = status.data;
  if (server?.data.connection === "local" || id === "shipyard-local")
    return (
      <Alert>
        <AlertDescription>
          Shipyard's local host and system infrastructure cannot be deleted.
        </AlertDescription>
      </Alert>
    );
  if (operation)
    return (
      <ServerDeletionProgress
        operation={operation}
        busy={busy || retrying}
        retryCleanup={retryCleanup}
        server={server}
        repair={repair}
        setRepair={setRepair}
      />
    );
  if (deleting) {
    if (status.isPending) return <Loading />;
    if (status.error) return <ErrorState error={status.error} />;
    return null;
  }
  if (!server) return <ErrorState error={new Error("Server not found")} />;
  return (
    <>
      <Alert variant="destructive">
        <AlertDescription>
          This permanently deletes applications, previews, deployment history
          and owned application volumes. Bind-mounted data, external storage,
          Docker and unrelated workloads remain. This cannot be undone.
        </AlertDescription>
      </Alert>
      <Button variant="outline" disabled={busy} onClick={review}>
        {busy ? <Spinner className="size-4 " /> : <RefreshCw />}
        {plan ? "Refresh cleanup inventory" : "Review cleanup inventory"}
      </Button>
      <ServerDeletionPlanReview
        plan={plan}
        name={name}
        setName={setName}
        ack={ack}
        setAck={setAck}
        busy={busy || confirming}
        submitConfirmation={submitConfirmation}
      />
    </>
  );
}
