import { RefreshCw } from "lucide-react";

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

import { useSystemUpdatesPage } from "../hooks";
import { VersionChangeOperation } from "./VersionChangeOperation";
import { VersionChangeReview } from "./VersionChangeReview";

export function SystemUpdates() {
  const { state, derived, handlers } = useSystemUpdatesPage();
  const { target, pass, confirm, approve } = state;
  const { q, plan, busy, error, operation, active, blocked, available, apply } =
    derived;
  const {
    setTarget,
    setPass,
    setConfirm,
    setApprove,
    applied,
    resetErrors,
    checkUpdates,
    download,
    previewVersion,
  } = handlers;
  if (!q.data) {
    if (q.error) return <ErrorState error={q.error} />;
    return <Loading />;
  }
  const s = q.data;
  const current = s.installation?.release;
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
                onValueChange={setTarget}
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
                onApplied={applied}
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
