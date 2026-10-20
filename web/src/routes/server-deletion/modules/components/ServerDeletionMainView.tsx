import { RefreshCw } from "lucide-react";
import { useParams } from "react-router";

import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useServerDeletionPage } from "../hooks";
import { ServerDeletionHeader } from "./ServerDeletionHeader";
import { ServerDeletionPlanReview } from "./ServerDeletionPlanReview";
import { ServerDeletionProgress } from "./ServerDeletionProgress";

export function ServerDeletionMainView() {
  const { id = "" } = useParams();
  const { state, derived, handlers } = useServerDeletionPage(id);
  const { name, ack, repair } = state;
  const {
    account,
    resources,
    server,
    deleting,
    status,
    plan,
    error,
    reviewing: busy,
    confirming,
    retrying,
  } = derived;
  const {
    setName,
    setAck,
    setRepair,
    review,
    submitConfirmation,
    retryCleanup,
  } = handlers;
  if (!account?.admin)
    return (
      <ErrorState error={new Error("Platform administrator access required")} />
    );
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  const operation = status.data;
  return (
    <>
      <ServerDeletionHeader server={server} operation={operation} />
      <div className="space-y-6">
        {server?.data.connection === "local" || id === "shipyard-local" ? (
          <Alert>
            <AlertDescription>
              Shipyard's local host and system infrastructure cannot be deleted.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {operation ? (
              <ServerDeletionProgress
                operation={operation}
                busy={busy || retrying}
                retryCleanup={retryCleanup}
                server={server}
                repair={repair}
                setRepair={setRepair}
              />
            ) : deleting ? (
              <>
                {status.isPending ? (
                  <Loading />
                ) : (
                  status.error && <ErrorState error={status.error} />
                )}
              </>
            ) : server ? (
              <>
                <Alert variant="destructive">
                  <AlertDescription>
                    This permanently deletes applications, previews, deployment
                    history and owned application volumes. Bind-mounted data,
                    external storage, Docker and unrelated workloads remain.
                    This cannot be undone.
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void review()}
                >
                  {busy ? <Spinner className="size-4 " /> : <RefreshCw />}
                  {plan
                    ? "Refresh cleanup inventory"
                    : "Review cleanup inventory"}
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
            ) : (
              <ErrorState error={new Error("Server not found")} />
            )}
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
