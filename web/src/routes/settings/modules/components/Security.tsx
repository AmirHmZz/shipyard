import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton, StateBadge } from "@/components/shared";
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
import { errorMessage, type Session } from "@/lib/api";
import { sessionKeys } from "@/lib/query-keys";
import {
  totpCodeSchema,
  totpDisableSchema,
  totpPasswordSchema,
} from "@/lib/validation";

import { useDisableTOTP, useRegenerateRecoveryCodes } from "../hooks";
import { enableTOTP } from "../services";

export function Security({ session }: { session: Session }) {
  const client = useQueryClient();
  const disable = useDisableTOTP();
  const regenerate = useRegenerateRecoveryCodes();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(
    null,
  );
  const [recovery, setRecovery] = useState<string[]>([]);
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-primary/5">
          <KeyRound className="size-5 text-primary" />
        </div>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription>
          Add an authenticator to your local account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StateBadge state={session.user.totp ? "enabled" : "not configured"} />
        <div className="space-y-2">
          <Label>Current password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {setup ? (
          <>
            <Alert>
              <AlertDescription>
                <p className="mb-2">
                  Add this secret to your authenticator, then enter its
                  six-digit code.
                </p>
                <code className="break-all text-xs">{setup.secret}</code>
              </AlertDescription>
            </Alert>
            <CopyButton value={setup.url} label="Copy authenticator URL" />
            <div className="space-y-2">
              <Label>Authenticator code</Label>
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button
              onClick={async () => {
                try {
                  const v = await enableTOTP(totpCodeSchema.parse({ code }));
                  setRecovery(v.recoveryCodes);
                  setSetup(null);
                  setPassword("");
                  await client.invalidateQueries({ queryKey: sessionKeys.all });
                  toast.success("Authenticator enabled");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Confirm authenticator
            </Button>
          </>
        ) : session.user.totp ? (
          <>
            <div className="space-y-2">
              <Label>Authenticator / recovery code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button
              variant="destructive"
              disabled={disable.isPending}
              onClick={async () => {
                if (disable.isPending) return;
                try {
                  await disable.mutateAsync(
                    totpDisableSchema.parse({ password, code }),
                  );
                  setPassword("");
                  setCode("");
                  toast.success("Authenticator disabled");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Disable authenticator
            </Button>
          </>
        ) : (
          <Button
            disabled={regenerate.isPending}
            onClick={async () => {
              if (regenerate.isPending) return;
              try {
                setSetup(
                  await regenerate.mutateAsync(
                    totpPasswordSchema.parse({ password }),
                  ),
                );
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <ShieldCheck />
            Set up authenticator
          </Button>
        )}
        {!!recovery.length && (
          <Alert>
            <AlertDescription>
              <p className="mb-3">
                Save these recovery codes now. Each can be used once.
              </p>
              <pre className="text-xs">{recovery.join("\n")}</pre>
              <div className="mt-3">
                <CopyButton
                  value={recovery.join("\n")}
                  label="Copy recovery codes"
                />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
