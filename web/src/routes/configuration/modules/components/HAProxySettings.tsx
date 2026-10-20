import type { Resource } from "@/lib/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { settingsDraft } from "../hooks";
import { useHAProxyController } from "../hooks";
import { HAProxyFrontend } from "./HAProxyFrontend";

export function HAProxySettings({
  server,
  onOpenChange,
}: {
  server: Resource;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    q,
    draft,
    setDraft,
    pending,
    stale,
    success,
    error,
    setError,
    update,
    save,
  } = useHAProxyController(server);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>HAProxy settings · {server.name}</DialogTitle>
          <DialogDescription>
            Choose listening IP addresses for each frontend. Application
            routing, certificates, and listener ports stay managed by Shipyard.
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          draft &&
          q.data && (
            <>
              <p className="text-xs text-muted-foreground">
                {q.data.image} · Revision {q.data.version}
              </p>
              <fieldset
                disabled={pending}
                className="min-w-0 space-y-4 disabled:opacity-70"
              >
                {q.data.frontends.map((frontend) => {
                  return (
                    <HAProxyFrontend
                      key={frontend.id}
                      frontend={frontend}
                      draft={draft}
                      update={update}
                    />
                  );
                })}
              </fieldset>
              <p className="text-xs text-muted-foreground">
                Enter IP addresses only, without ports or CIDR ranges. Defaults
                listen on all IPv4 interfaces and include IPv6 when configured
                on the server.
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
                      onClick={() => {
                        setDraft(settingsDraft(q.data));
                        setError("");
                      }}
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
              {(error ||
                (!pending &&
                  q.data.apply?.state === "failed" &&
                  q.data.apply.error)) && (
                <Alert variant="destructive">
                  <AlertDescription className="break-words">
                    {error || q.data.apply?.error}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={
              !draft ||
              !!q.error ||
              pending ||
              stale ||
              Object.values(draft?.bindings || {}).some(
                (addresses) =>
                  !addresses.length ||
                  addresses.some((address) => !address.value.trim()),
              )
            }
            onClick={() => void save()}
          >
            {pending && <Spinner className="size-4" />} Save &amp; apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
