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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow, type DraftRow } from "@/lib/draft-rows";
import type { components } from "@/lib/schema";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Settings = components["schemas"]["HAProxySettings"];
type Draft = {
  version: number;
  bindings: Record<string, DraftRow<{ value: string }>[]>;
};
function settingsDraft(
  settings: Pick<Settings, "version" | "bindings">,
): Draft {
  return {
    version: settings.version,
    bindings: Object.fromEntries(
      Object.entries(settings.bindings).map(([id, addresses]) => [
        id,
        addresses.map((value) => draftRow({ value })),
      ]),
    ),
  };
}

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

function HAProxyFrontend({
  frontend,
  draft,
  update,
}: {
  frontend: Settings["frontends"][number];
  draft: Draft;
  update: (id: string, values: DraftRow<{ value: string }>[] | null) => void;
}) {
  const custom = draft.bindings[frontend.id];
  const defaults = custom === undefined;
  const values = custom || [];
  const id = `haproxy-${frontend.id}`;
  return (
    <section
      key={frontend.id}
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="break-words text-sm font-medium">
            {frontend.name}
          </h3>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {frontend.protocol}
            {frontend.applicationName && ` · ${frontend.applicationName}`}
          </p>
        </div>
        <Badge variant="secondary" className="font-mono font-normal">
          {frontend.ports.join(" / ")}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-defaults`}>Use default addresses</Label>
        <Switch
          id={`${id}-defaults`}
          checked={defaults}
          onCheckedChange={(useDefaults) =>
            update(
              frontend.id,
              useDefaults
                ? null
                : frontend.defaultAddresses.map((value) => draftRow({ value })),
            )
          }
        />
      </div>
      {defaults ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {frontend.defaultAddresses.join(", ")}
        </p>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={value.rowId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Label className="sr-only" htmlFor={`${id}-${index}`}>
                  {frontend.name} IP address {index + 1}
                </Label>
                <Input
                  id={`${id}-${index}`}
                  value={value.value}
                  placeholder="0.0.0.0 or ::"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-sm"
                  onChange={(event) =>
                    update(
                      frontend.id,
                      values.map((v, i) =>
                        i === index ? { ...v, value: event.target.value } : v,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${frontend.name} address ${index + 1}`}
                disabled={values.length === 1}
                onClick={() =>
                  update(
                    frontend.id,
                    values.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update(frontend.id, [...values, draftRow({ value: "" })])
            }
          >
            <Plus /> Add address
          </Button>
        </div>
      )}
      {frontend.id === "web" && (
        <p className="text-xs text-muted-foreground">
          HTTPS listens on port 443 when a certificate is available.
        </p>
      )}
    </section>
  );
}

function useHAProxyController(server: Resource) {
  const changes = useConfigurationChanges();
  const [editedDraft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const q = useQuery({
    queryKey: ["haproxy", server.id],
    queryFn: () => api<Settings>(`/servers/${server.id}/haproxy`),
    refetchInterval: 2000,
  });
  const bindings = q.data?.bindings;
  const version = q.data?.version;
  const savedDraft = useMemo(
    () =>
      bindings && version !== undefined
        ? settingsDraft({ bindings, version })
        : null,
    [bindings, version],
  );
  const draft = editedDraft ?? savedDraft;
  const applyId = q.data?.apply?.id;
  const applyState = q.data?.apply?.state;
  const applyError = q.data?.apply?.error;
  const lastJobId = q.data?.lastJobId;
  const queryVersion = q.data?.version;
  const queryBindings = q.data?.bindings;
  useEffect(() => {
    if (
      !job ||
      applyId !== job ||
      !["done", "failed"].includes(applyState || "")
    )
      return;
    setJob(null);
    if (
      applyState === "done" &&
      lastJobId === job &&
      queryVersion !== undefined &&
      queryBindings
    ) {
      setDraft({
        version: queryVersion,
        bindings: settingsDraft({
          version: queryVersion,
          bindings: queryBindings,
        }).bindings,
      });
      setSuccess(true);
    } else setError(applyError || "HAProxy settings could not be applied.");
  }, [
    job,
    applyId,
    applyState,
    applyError,
    lastJobId,
    queryVersion,
    queryBindings,
  ]);
  const pending =
    busy ||
    !!job ||
    (!!q.data?.apply && ["queued", "running"].includes(q.data.apply.state));
  const stale =
    !!draft &&
    !!q.data &&
    (draft.version !== q.data.version ||
      Object.keys(draft.bindings).some(
        (id) => !q.data.frontends.some((frontend) => frontend.id === id),
      ));
  const update = (id: string, values: DraftRow<{ value: string }>[] | null) => {
    setDraft((current) => {
      current ??= draft;
      if (!current) return current;
      const bindings = { ...current.bindings };
      if (values === null) delete bindings[id];
      else bindings[id] = values;
      return { ...current, bindings };
    });
    setSuccess(false);
  };
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const result = await api<{ jobId: string }>(
        `/servers/${server.id}/haproxy`,
        {
          method: "PUT",
          body: JSON.stringify({
            version: draft.version,
            bindings: Object.fromEntries(
              Object.entries(draft.bindings).map(([id, rows]) => [
                id,
                rows.map((row) => row.value),
              ]),
            ),
          }),
        },
      );
      setJob(result.jobId);
      changes.saved();
      await q.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return {
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
  };
}
