import { useParams } from "react-router";

import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useServerDeletionPage } from "../hooks";
import { ServerDeletionBody } from "./ServerDeletionBody";
import { ServerDeletionHeader } from "./ServerDeletionHeader";
export function ServerDeletionMainView() {
  const { id = "" } = useParams();
  const controller = useServerDeletionPage(id);
  const { account, resources, server, status, error } = controller.derived;
  if (!account?.admin)
    return (
      <ErrorState error={new Error("Platform administrator access required")} />
    );
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  return (
    <>
      <ServerDeletionHeader server={server} operation={status.data} />
      <div className="space-y-6">
        <ServerDeletionBody id={id} controller={controller} />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
