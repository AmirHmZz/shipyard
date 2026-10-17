import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, type Resource } from "@/lib/api";
import type { components } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/configuration-surface";
import { ErrorState, Loading } from "@/components/shared";

type Settings = components["schemas"]["HAProxySettings"];
type Draft = components["schemas"]["HAProxySettingsInput"];

export function HAProxySettings({
  server,
  onOpenChange,
}: {
  server: Resource;
  onOpenChange: (open: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = location.pathname.startsWith("/configure/");
  useEffect(() => {
    if (!page) navigate(`/configure/haproxy/${server.id}?return=/servers`);
  }, [page]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const q = useQuery({
    queryKey: ["haproxy", server.id],
    queryFn: () => api<Settings>(`/servers/${server.id}/haproxy`),
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (!q.data) return;
    if (!draft) {
      setDraft({
        version: q.data.version,
        bindings: structuredClone(q.data.bindings),
      });
      if (q.data.apply && ["queued", "running"].includes(q.data.apply.state))
        setJob(q.data.apply.id);
    }
    if (
      job &&
      q.data.apply?.id === job &&
      ["done", "failed"].includes(q.data.apply.state)
    ) {
      setJob(null);
      if (q.data.apply.state === "done" && q.data.lastJobId === job) {
        setDraft({
          version: q.data.version,
          bindings: structuredClone(q.data.bindings),
        });
        setSuccess(true);
      } else
        setError(
          q.data.apply.error || "HAProxy settings could not be applied.",
        );
    }
  }, [q.data, draft, job]);
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
  const update = (id: string, values: string[] | null) => {
    setDraft((current) => {
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
        { method: "PUT", body: JSON.stringify(draft) },
      );
      setJob(result.jobId);
      window.dispatchEvent(new Event("configuration-saved"));
      await q.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (!page) return null;
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
                  const custom = draft.bindings[frontend.id];
                  const defaults = custom === undefined;
                  const values = custom || frontend.defaultAddresses;
                  const id = `haproxy-${frontend.id}`;
                  return (
                    <section
                      key={frontend.id}
                      aria-labelledby={`${id}-title`}
                      className="space-y-4 rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3
                            id={`${id}-title`}
                            className="break-words text-sm font-medium"
                          >
                            {frontend.name}
                          </h3>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {frontend.protocol}
                            {frontend.applicationName &&
                              ` · ${frontend.applicationName}`}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="font-mono font-normal"
                        >
                          {frontend.ports.join(" / ")}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`${id}-defaults`}>
                          Use default addresses
                        </Label>
                        <Switch
                          id={`${id}-defaults`}
                          checked={defaults}
                          onCheckedChange={(useDefaults) =>
                            update(
                              frontend.id,
                              useDefaults
                                ? null
                                : [...frontend.defaultAddresses],
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
                            <div
                              key={index}
                              className="flex items-center gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <Label
                                  className="sr-only"
                                  htmlFor={`${id}-${index}`}
                                >
                                  {frontend.name} IP address {index + 1}
                                </Label>
                                <Input
                                  id={`${id}-${index}`}
                                  value={value}
                                  placeholder="0.0.0.0 or ::"
                                  autoComplete="off"
                                  spellCheck={false}
                                  className="font-mono text-sm"
                                  onChange={(event) =>
                                    update(
                                      frontend.id,
                                      values.map((v, i) =>
                                        i === index ? event.target.value : v,
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
                            onClick={() => update(frontend.id, [...values, ""])}
                          >
                            <Plus /> Add address
                          </Button>
                        </div>
                      )}
                      {frontend.id === "web" && (
                        <p className="text-xs text-muted-foreground">
                          HTTPS listens on port 443 when a certificate is
                          available.
                        </p>
                      )}
                    </section>
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
                        setDraft({
                          version: q.data.version,
                          bindings: structuredClone(q.data.bindings),
                        });
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
                  <Loader2 className="size-4 animate-spin" /> Validating and
                  applying HAProxy bindings…
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
                  addresses.some((address) => !address.trim()),
              )
            }
            onClick={() => void save()}
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save &amp;
            apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
