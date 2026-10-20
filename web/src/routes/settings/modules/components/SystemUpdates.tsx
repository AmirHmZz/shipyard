import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { describeError } from "@/lib/api/translate-error";

import type { Plan } from "../generics";

import {
  useSystemUpdates,
  useDownloadUpdateBackup,
  useCheckForUpdates,
  usePlanUpdate,
  useApplyUpdate,
} from "../hooks";
import { VersionChangeOperation } from "./VersionChangeOperation";
import { VersionChangeReview } from "./VersionChangeReview";

const terminal = ["succeeded", "rolled_back", "failed", "recovery_required"];

export function SystemUpdates() {
  const q = useSystemUpdates();
  const [target, setTarget] = useState(""),
    [plan, setPlan] = useState<Plan | null>(null),
    [pass, setPass] = useState(""),
    [confirm, setConfirm] = useState(""),
    [approve, setApprove] = useState(false);
  const check = useCheckForUpdates();
  const planChange = usePlanUpdate();
  const apply = useApplyUpdate();
  const backup = useDownloadUpdateBackup();
  const operations = [check, planChange, apply, backup];
  const busy = operations.some((operation) => operation.isPending);
  const failure = operations.find((operation) => operation.error)?.error;
  const error = failure ? describeError(failure) : "";
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
  function resetErrors() {
    for (const operation of operations) operation.reset();
  }
  function checkUpdates() {
    if (busy || blocked) return;
    resetErrors();
    check.mutate();
  }
  function download() {
    if (!operation || busy) return;
    resetErrors();
    backup.mutate(operation.id, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `shipyard-${operation.id}.sybackup`;
        link.click();
        URL.revokeObjectURL(url);
      },
    });
  }
  function previewVersion() {
    if (busy || blocked || !target) return;
    resetErrors();
    planChange.mutate(
      { target },
      {
        onSuccess: (value) => {
          setPlan(value);
          setApprove(false);
          setConfirm("");
        },
      },
    );
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
            onClick={checkUpdates}
          >
            {busy ? <Spinner className="size-4" /> : <RefreshCw />}
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
                onClick={previewVersion}
              >
                Preview version change
              </Button>
            </div>
            {plan && (
              <VersionChangeReview
                plan={plan}
                pass={pass}
                setPass={setPass}
                confirm={confirm}
                setConfirm={setConfirm}
                approve={approve}
                setApprove={setApprove}
                busy={busy}
                blocked={blocked}
                apply={apply}
                resetErrors={resetErrors}
                setPlan={setPlan}
              />
            )}
          </>
        )}
        {operation && (
          <VersionChangeOperation
            operation={operation}
            active={active}
            busy={busy}
            reconnecting={!!q.error}
            version={s.version.version}
            download={download}
          />
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
