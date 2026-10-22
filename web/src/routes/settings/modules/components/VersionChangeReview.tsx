import type * as React from "react";
import type { FormEvent } from "react";

import { FormField } from "@/components/FormField";
import { StateBadge } from "@/components/Shared";
import { TableHeadings } from "@/components/TableHeadings";
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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastValidationError } from "@/lib/api/toaster";

import type { Plan } from "../generics";
import type { useApplyUpdate } from "../hooks";

import { updateFormSchema } from "../generics";
import { ReleaseNotes } from "./ReleaseNotes";

export type VersionChangeReviewProps = {
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
  onApplied: () => void;
};
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
  onApplied,
}: VersionChangeReviewProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setPass(e.target.value);
  }
  function handleInputChange2(e: React.ChangeEvent<HTMLInputElement>) {
    return setConfirm(e.target.value);
  }

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
        onApplied();
      },
    });
  }
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
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
            <TableHeadings
              columns={[
                { id: "migration", label: <>Migration</> },
                { id: "effect", label: <>Effect</> },
              ]}
              rowProps={{}}
            />
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
      <form className="flex flex-col gap-4" onSubmit={submitUpdate}>
        <FormField
          label={<>Backup passphrase</>}
          labelProps={{ htmlFor: "upgrade-passphrase" }}
        >
          <Input
            id="upgrade-passphrase"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={pass}
            onChange={handleInputChange}
          />
          <p className="text-sm text-muted-foreground">
            Keep this passphrase. You need it to restore the encrypted
            pre-change backup.
          </p>
        </FormField>
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
              onChange={handleInputChange2}
            />
          </>
        )}
        <Button
          className="self-start"
          variant={plan.destructive ? "destructive" : "default"}
          disabled={
            busy ||
            blocked ||
            pass.length < 12 ||
            (plan.destructive && (!approve || confirm !== plan.target.version))
          }
        >
          {busy && <Spinner className="size-4" />}Back up & apply{" "}
          {plan.target.version}
        </Button>
      </form>
    </section>
  );
}
