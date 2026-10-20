import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Session } from "@/lib/api";

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
import { errorMessage } from "@/lib/api";
import { passphraseSchema } from "@/lib/validation";

import { useSetMaintenanceMode } from "../hooks";
import { downloadBackup } from "../services";

export function Backup({ session }: { session: Session }) {
  const maintenance = useSetMaintenanceMode();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
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
            onCheckedChange={async (enabled) => {
              try {
                await maintenance.mutateAsync(enabled);
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
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
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const blob = await downloadBackup(
                  passphraseSchema.parse({ passphrase }),
                );
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `shipyard-${new Date().toISOString().slice(0, 10)}.sybackup`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                setPassphrase("");
                toast.success("Encrypted backup downloaded");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Label htmlFor="passphrase">Backup passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              minLength={12}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
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
