import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { useHAProxyController } from "../hooks";

import { HAProxyFrontend } from "./HAProxyFrontend";
export type HAProxyBindingsProps = {
  controller: ReturnType<typeof useHAProxyController>;
};
export function HAProxyBindings({ controller }: HAProxyBindingsProps) {
  const { draft } = controller.state;
  const { q, pending, stale, success, error } = controller.derived;
  const { reloadSaved, update } = controller.handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (!draft || !q.data) return null;
  let displayError = error;
  if (!displayError && !pending && q.data.apply?.state === "failed")
    displayError = q.data.apply.error || "";
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {q.data.image} · Revision {q.data.version}
      </p>
      <fieldset
        disabled={pending}
        className="min-w-0 space-y-4 disabled:opacity-70"
      >
        {q.data.frontends.map((frontend) => (
          <HAProxyFrontend
            key={frontend.id}
            frontend={frontend}
            draft={draft}
            update={update}
          />
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Enter IP addresses only, without ports or CIDR ranges. Defaults listen
        on all IPv4 interfaces and include IPv6 when configured on the server.
      </p>
      {stale && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p>Settings changed since this form was loaded.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={reloadSaved}
            >
              Reload saved settings
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {pending && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner className="size-4" /> Validating and applying HAProxy
          bindings…
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-primary">
          HAProxy settings applied.
        </p>
      )}
      {displayError && (
        <Alert variant="destructive">
          <AlertDescription className="break-words">
            {displayError}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
