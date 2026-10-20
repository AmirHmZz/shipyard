import type { FormEvent } from "react";

import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastValidationError } from "@/lib/api/toaster";

import type { Plan } from "../generics";
import type { useApplyUpdate } from "../hooks";

import { updateFormSchema } from "../generics";
import { ReleaseNotes } from "./ReleaseNotes";

export function VersionChangeReview({
  plan,
  pass,
  setPass,
  confirm,
  setConfirm,
  approve,
  setApprove,
  busy,
  blocked,
  apply,
  resetErrors,
  setPlan,
}: {
  plan: Plan;
  pass: string;
  setPass: (value: string) => void;
  confirm: string;
  setConfirm: (value: string) => void;
  approve: boolean;
  setApprove: (value: boolean) => void;
  busy: boolean;
  blocked: boolean;
  apply: ReturnType<typeof useApplyUpdate>;
  resetErrors: () => void;
  setPlan: (value: Plan | null) => void;
}) {
  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    resetErrors();
    const parsed = updateFormSchema(
      plan.target.version,
      plan.destructive,
    ).safeParse({
      planId: plan.id,
      passphrase: pass,
      confirmation: confirm,
      approveDataLoss: approve,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    apply.mutate(parsed.data, {
      onSuccess: () => {
        setPass("");
        setPlan(null);
      },
    });
  }
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h3 className="font-medium">
        {plan.current.version} → {plan.target.version}
      </h3>
      {plan.target.notes && <ReleaseNotes>{plan.target.notes}</ReleaseNotes>}
      <p className="text-sm">
        Database schema {plan.migrations.current} → {plan.migrations.target}
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
            This change discards the data described above. Reverse migrations do
            not recreate discarded values; restoring the backup is required to
            recover them.
          </AlertDescription>
        </Alert>
      )}
      <form className="space-y-4" onSubmit={submitUpdate}>
        <div className="space-y-2">
          <Label htmlFor="upgrade-passphrase">Backup passphrase</Label>
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
            (plan.destructive && (!approve || confirm !== plan.target.version))
          }
        >
          {busy && <Spinner className="size-4 " />}Back up & apply{" "}
          {plan.target.version}
        </Button>
      </form>
    </section>
  );
}
