import type * as React from "react";
import type { FormEvent } from "react";

import { Download } from "lucide-react";
import { useState } from "react";

import type { Session } from "@/lib/api/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toastValidationError } from "@/lib/api/toaster";

import { passphraseSchema } from "../generics";
import { useSetMaintenanceMode, useDownloadBackup } from "../hooks";

export type BackupProps = { session: Session };
export function Backup({ session }: BackupProps) {
  function handleSwitchCheckedChange(enabled: boolean) {
    return maintenance.mutate(enabled);
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setPassphrase(e.target.value);
  }

  const maintenance = useSetMaintenanceMode();
  const [passphrase, setPassphrase] = useState("");
  const backup = useDownloadBackup();
  const busy = backup.isPending;
  function exportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = passphraseSchema.safeParse({ passphrase });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    backup.mutate(parsed.data, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `shipyard-${new Date().toISOString().slice(0, 10)}.sybackup`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setPassphrase("");
      },
    });
  }
  return (
    <div className="max-w-2xl space-y-5">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Maintenance mode</CardTitle>
          <CardDescription>
            Pause new operations before creating a consistent backup. Running
            applications keep serving traffic.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label>Maintenance mode</Label>
          <Switch
            checked={session.maintenance || false}
            disabled={maintenance.isPending}
            onCheckedChange={handleSwitchCheckedChange}
          />
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Export Shipyard</CardTitle>
          <CardDescription>
            Includes the database, encrypted credentials, certificate keys, and
            control-plane files. Remote application volumes and images are
            excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={exportBackup}>
            <Label htmlFor="passphrase">Backup passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              minLength={12}
              value={passphrase}
              onChange={handleInputChange}
              required
            />
            <Button disabled={busy || !session.maintenance}>
              {busy ? <Spinner className="size-4 " /> : <Download />}Export
              encrypted backup
            </Button>
          </form>
        </CardContent>
      </Card>
      <Alert>
        <AlertDescription>
          Restore using the <code>shipyard restore</code> command against an
          empty PostgreSQL database while the control plane is stopped. See the
          recovery guide in the repository.
        </AlertDescription>
      </Alert>
    </div>
  );
}
