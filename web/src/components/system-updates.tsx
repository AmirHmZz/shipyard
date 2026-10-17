import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { api, post, errorMessage } from "@/lib/api";
import type { components } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Loading, ErrorState, StateBadge } from "@/components/shared";
type Status = components["schemas"]["SystemUpdates"];
type Plan = components["schemas"]["VersionChangePlan"];
const terminal = ["succeeded", "rolled_back", "failed", "recovery_required"];
export function SystemUpdates() {
  const q = useQuery({
    queryKey: ["system-updates"],
    queryFn: () => api<Status>("/settings/updates"),
    refetchInterval: 3000,
  });
  const [target, setTarget] = useState(""),
    [plan, setPlan] = useState<Plan | null>(null),
    [pass, setPass] = useState(""),
    [confirm, setConfirm] = useState(""),
    [approve, setApprove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!q.data) {
    if (q.error) return <ErrorState error={q.error} />;
    return <Loading />;
  }
  const s = q.data,
    operation = s.operation,
    active = !!operation && !terminal.includes(operation.state),
    blocked = active || operation?.state === "recovery_required";
  const current = s.installation?.release,
    available = s.releases.filter(
      (r) => r.previous === current?.version || current?.previous === r.version,
    );
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!operation) return;
    await action(async () => {
      const blob = await api<Blob>(`/settings/updates/${operation.id}/backup`);
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `shipyard-${operation.id}.sybackup`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>System updates</CardTitle>
        <CardDescription>
          Administrator-requested upgrades and downgrades. Applications keep
          running while the dashboard restarts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">
              Shipyard {s.version?.version || "development"}
            </p>
            <p className="text-sm text-muted-foreground break-all">
              Commit {s.version?.commit} · {s.version?.architecture}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!s.enabled || busy || blocked}
            onClick={() =>
              void action(() => post("/settings/updates/check", {}))
            }
          >
            <RefreshCw className={busy ? "animate-spin" : ""} />
            Check for updates
          </Button>
        </div>
        {!s.enabled ? (
          <Alert>
            <AlertDescription>
              {s.reason ||
                "System updates require a native installation managed by the release installer."}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              <Label htmlFor="system-version">Target version</Label>
              <Select
                value={target || undefined}
                onValueChange={(v) => {
                  setTarget(v);
                  setPlan(null);
                  setPass("");
                  setApprove(false);
                  setConfirm("");
                }}
                disabled={busy || blocked}
              >
                <SelectTrigger
                  id="system-version"
                  className="w-full sm:max-w-sm"
                >
                  <SelectValue placeholder="Select a tested release step" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((r) => (
                    <SelectItem key={r.version} value={r.version}>
                      {r.version}{" "}
                      {r.previous === current?.version
                        ? "(upgrade)"
                        : "(downgrade)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!available.length && (
                <p className="text-sm text-muted-foreground">
                  Check for releases to find supported steps. Skipped versions
                  require intermediate releases.
                </p>
              )}
              <Button
                variant="outline"
                disabled={!target || busy || blocked}
                onClick={() =>
                  void action(async () => {
                    setPlan(
                      await post<Plan>("/settings/updates/plan", { target }),
                    );
                    setApprove(false);
                    setConfirm("");
                  })
                }
              >
                Preview version change
              </Button>
            </div>
            {plan && (
              <section className="space-y-4 rounded-lg border p-4">
                <h3 className="font-medium">
                  {plan.current.version} → {plan.target.version}
                </h3>
                {plan.target.notes && (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {plan.target.notes}
                  </p>
                )}
                <p className="text-sm">
                  Database schema {plan.migrations.current} →{" "}
                  {plan.migrations.target}
                </p>
                {plan.migrations.steps.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Migration</TableHead>
                        <TableHead>Effect</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.migrations.steps.map((m) => (
                        <TableRow key={`${m.version}-${m.direction}`}>
                          <TableCell>
                            {m.version} · {m.direction}
                          </TableCell>
                          <TableCell>
                            <p>{m.impact}</p>
                            <StateBadge state={m.classification} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No database schema changes.
                  </p>
                )}
                {plan.destructive && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      This change discards the data described above. Reverse
                      migrations do not recreate discarded values; restoring the
                      backup is required to recover them.
                    </AlertDescription>
                  </Alert>
                )}
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await post("/settings/updates", {
                        planId: plan.id,
                        passphrase: pass,
                        confirmation: confirm,
                        approveDataLoss: approve,
                      });
                      setPass("");
                      setPlan(null);
                    });
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="upgrade-passphrase">
                      Backup passphrase
                    </Label>
                    <Input
                      id="upgrade-passphrase"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Keep this passphrase. You need it to restore the encrypted
                      pre-change backup.
                    </p>
                  </div>
                  {plan.destructive && (
                    <>
                      <div className="flex items-center gap-3">
                        <Switch
                          id="upgrade-loss"
                          checked={approve}
                          onCheckedChange={setApprove}
                        />
                        <Label htmlFor="upgrade-loss">
                          I approve the listed data loss
                        </Label>
                      </div>
                      <Label htmlFor="upgrade-confirm">
                        Type {plan.target.version} to confirm
                      </Label>
                      <Input
                        id="upgrade-confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </>
                  )}
                  <Button
                    variant={plan.destructive ? "destructive" : "default"}
                    disabled={
                      busy ||
                      blocked ||
                      pass.length < 12 ||
                      (plan.destructive &&
                        (!approve || confirm !== plan.target.version))
                    }
                  >
                    {busy && <Loader2 className="animate-spin" />}Back up &
                    apply {plan.target.version}
                  </Button>
                </form>
              </section>
            )}
          </>
        )}
        {operation && (
          <section className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-medium">
                Version change to {operation.plan.target.version}
              </h3>
              <StateBadge state={operation.state} />
              {active && <Loader2 className="size-4 animate-spin" />}
            </div>
            {q.error && active && (
              <p className="text-sm text-muted-foreground">
                The dashboard is restarting. Reconnecting automatically…
              </p>
            )}
            {operation.error && (
              <Alert variant="destructive">
                <AlertDescription>{operation.error}</AlertDescription>
              </Alert>
            )}
            {operation.state === "recovery_required" && (
              <p className="text-sm">
                Maintenance mode remains enabled. An administrator must inspect
                the updater journal on the server and recover using the
                encrypted backup.
              </p>
            )}
            {operation.backup && (
              <Button
                variant="outline"
                onClick={() => void download()}
                disabled={busy || active}
              >
                <Download />
                Download encrypted backup
              </Button>
            )}
            {operation.state === "succeeded" &&
              s.version.version !== operation.plan.target.version && (
                <Button onClick={() => location.reload()}>
                  Reload dashboard
                </Button>
              )}
          </section>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
