import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  api,
  post,
  useResources,
  useAccount,
  APIError,
  errorMessage,
  text,
  type Resource,
} from "@/lib/api";
import type { components } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  PageHeader,
  Loading,
  ErrorState,
  StateBadge,
} from "@/components/shared";

type Plan = components["schemas"]["ServerDeletionPlan"];
type Status = components["schemas"]["ServerDeletionStatus"];
type Item = components["schemas"]["DeletionItem"];
function Inventory({ title, items }: { title: string; items: Item[] }) {
  const [all, setAll] = useState(false);
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="py-5">
        <CardTitle className="text-base" role="heading" aria-level={2}>
          {title}{" "}
          <span className="text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      {items.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(all ? items : items.slice(0, 15)).map((item, i) => (
                <TableRow key={`${item.kind}-${item.id}-${i}`}>
                  <TableCell className="capitalize">{item.kind}</TableCell>
                  <TableCell className="max-w-xs break-all whitespace-normal font-medium">
                    {item.name}
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">
                    {item.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.length > 15 && (
            <div className="p-4">
              <Button variant="outline" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : `Show all ${items.length}`}
              </Button>
            </div>
          )}
        </>
      ) : (
        <CardContent className="pb-5 text-sm text-muted-foreground">
          None found.
        </CardContent>
      )}
    </Card>
  );
}
function RepairConnection({
  server,
  onSaved,
}: {
  server: Resource;
  onSaved: () => void;
}) {
  const [host, setHost] = useState(text(server.data, "host"));
  const [port, setPort] = useState(String(server.data.port || 22));
  const [user, setUser] = useState(text(server.data, "user"));
  const [fingerprint, setFingerprint] = useState(
    text(server.data, "fingerprint"),
  );
  const [auth, setAuth] = useState(
    text(server.data, "authMethod", "private_key"),
  );
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base" role="heading" aria-level={2}>
          Repair SSH connection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`/servers/${server.id}/deletion/connection`, {
                method: "PUT",
                body: JSON.stringify({
                  host,
                  port: Number(port),
                  user,
                  fingerprint,
                  authMethod: auth,
                  secrets: credential
                    ? {
                        [auth === "password" ? "password" : "private_key"]:
                          credential,
                      }
                    : {},
                }),
              });
              setCredential("");
              onSaved();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            The repaired connection must reach the same Docker daemon. Leave the
            credential blank to keep its saved value.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["SSH host", host, setHost],
              ["SSH port", port, setPort],
              ["SSH user", user, setUser],
              ["Verified host fingerprint", fingerprint, setFingerprint],
            ].map(([label, value, setter]) => (
              <div key={String(label)} className="space-y-2">
                <Label htmlFor={String(label)}>{String(label)}</Label>
                <Input
                  id={String(label)}
                  value={String(value)}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                  required
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-auth">Authentication</Label>
            <Select
              value={auth}
              onValueChange={(v) => {
                setAuth(v);
                setCredential("");
              }}
            >
              <SelectTrigger id="repair-auth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private_key">
                  Private key (recommended)
                </SelectItem>
                <SelectItem value="password">Password</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-credential">
              {auth === "password" ? "Password" : "Private key"}
            </Label>
            {auth === "password" ? (
              <Input
                id="repair-credential"
                type="password"
                autoComplete="new-password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              />
            ) : (
              <Textarea
                id="repair-credential"
                className="font-mono"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              />
            )}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="outline" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}Verify & save
            connection
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
export function ServerDeletion() {
  const { id = "" } = useParams();
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
  const status = useQuery({
    queryKey: ["server-deletion", id],
    queryFn: () => api<Status>(`/servers/${id}/deletion`),
    enabled:
      !!account?.admin && (deleting || (!resources.isPending && !server)),
    retry: false,
    refetchInterval: (q) => (q.state.data?.done ? false : 2000),
  });
  async function review() {
    setBusy(true);
    setError("");
    setPlan(null);
    setName("");
    setAck(false);
    try {
      setPlan(await post<Plan>(`/servers/${id}/deletion-plan`));
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
              <>
                <Card className="shadow-none">
                  <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium capitalize">
                        {operation.stage}
                      </p>
                      <StateBadge
                        state={
                          operation.done
                            ? "done"
                            : operation.error
                              ? "failed"
                              : "queued"
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {operation.done
                        ? "Host cleanup completed. The server and its applications have been removed. The audit trail is retained."
                        : "The server stays registered until cleanup succeeds. Workloads on this server are being permanently removed."}
                    </p>
                    {operation.error && (
                      <>
                        <Alert variant="destructive">
                          <AlertDescription>{operation.error}</AlertDescription>
                        </Alert>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await post(`/servers/${id}/deletion/retry`);
                                await status.refetch();
                              } catch (e) {
                                setError(errorMessage(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <RefreshCw className={busy ? "animate-spin" : ""} />
                            Retry cleanup
                          </Button>
                          {server && (
                            <Button
                              variant="outline"
                              onClick={() => setRepair(!repair)}
                            >
                              Repair connection
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
                {repair && server && (
                  <RepairConnection
                    server={server}
                    onSaved={() => {
                      setRepair(false);
                      void client.invalidateQueries({
                        queryKey: ["resources"],
                      });
                    }}
                  />
                )}
              </>
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
                  {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {plan
                    ? "Refresh cleanup inventory"
                    : "Review cleanup inventory"}
                </Button>
                {plan && (
                  <>
                    {plan.blockers.length > 0 && (
                      <Alert variant="destructive">
                        <AlertDescription>
                          <p className="mb-2 font-medium">
                            Resolve these conflicts before deletion:
                          </p>
                          <ul className="list-disc space-y-1 pl-5">
                            {plan.blockers.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                    <Inventory title="Will be removed" items={plan.remove} />
                    <Inventory
                      title="Will remain on the host"
                      items={plan.preserve}
                    />
                    <Card className="shadow-none">
                      <CardHeader>
                        <CardTitle
                          className="text-base"
                          role="heading"
                          aria-level={2}
                        >
                          Confirm server deletion
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <form
                          className="space-y-5"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setBusy(true);
                            setError("");
                            try {
                              await api(`/servers/${id}`, {
                                method: "DELETE",
                                body: JSON.stringify({
                                  planId: plan.id,
                                  name,
                                  deleteVolumes: ack,
                                }),
                              });
                              await client.invalidateQueries({
                                queryKey: ["resources"],
                              });
                              await client.invalidateQueries({
                                queryKey: ["server-deletion", id],
                              });
                            } catch (e) {
                              setError(errorMessage(e));
                              if (e instanceof APIError && e.status === 409) {
                                setPlan(null);
                                setName("");
                                setAck(false);
                              }
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <div className="space-y-2">
                            <Label htmlFor="delete-server-name">
                              Type {plan.serverName} to confirm
                            </Label>
                            <Input
                              id="delete-server-name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              autoComplete="off"
                              disabled={busy}
                            />
                          </div>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id="delete-server-volumes"
                              checked={ack}
                              onCheckedChange={(v) => setAck(v === true)}
                              disabled={busy}
                            />
                            <Label
                              htmlFor="delete-server-volumes"
                              className="leading-5"
                            >
                              I understand that owned application volumes and
                              their data will be permanently deleted.
                            </Label>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button type="button" variant="outline" asChild>
                              <Link to="/servers">Cancel</Link>
                            </Button>
                            <Button
                              type="submit"
                              variant="destructive"
                              disabled={
                                busy ||
                                name !== plan.serverName ||
                                !ack ||
                                plan.blockers.length > 0
                              }
                            >
                              {busy ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                              Delete server
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                  </>
                )}
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
