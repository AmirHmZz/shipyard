import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useAccount, useResources } from "@/lib/api";

import type { Plan } from "../generics";

import { useReviewServerDeletion, useServerDeletionStatus } from "../hooks";
import { ServerDeletionHeader } from "./ServerDeletionHeader";
import { ServerDeletionPlanReview } from "./ServerDeletionPlanReview";
import { ServerDeletionProgress } from "./ServerDeletionProgress";

export function ServerDeletionMainView() {
  const { id = "" } = useParams();
  const reviewMutation = useReviewServerDeletion();
  const account = useAccount();
  const resources = useResources();
  const client = useQueryClient();
  const server = resources.data?.find(
    (r) => r.id === id && r.kind === "server",
  );
  const deleting = !!server?.data.deleting;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repair, setRepair] = useState(false);
  const status = useServerDeletionStatus(
    id,
    !!account?.admin && (deleting || (!resources.isPending && !server)),
  );
  async function review() {
    setBusy(true);
    setError("");
    setPlan(null);
    setName("");
    setAck(false);
    try {
      setPlan(await reviewMutation.mutateAsync(id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
                busy={busy}
                setBusy={setBusy}
                setError={setError}
                id={id}
                status={status}
                server={server}
                repair={repair}
                setRepair={setRepair}
                client={client}
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
                  setPlan={setPlan}
                  name={name}
                  setName={setName}
                  ack={ack}
                  setAck={setAck}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  id={id}
                  client={client}
                  review={review}
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
