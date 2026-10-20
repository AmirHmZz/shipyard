import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { Session } from "@/lib/api/types";

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
import { toastValidationError } from "@/lib/api/toaster";

import {
  totpCodeSchema,
  totpDisableSchema,
  totpPasswordSchema,
} from "../generics";
import { useDisableTOTP, useStartTOTP, useEnableTOTP } from "../hooks";

export function Security({ session }: { session: Session }) {
  const disable = useDisableTOTP();
  const start = useStartTOTP();
  const enable = useEnableTOTP();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const setup = start.data;
  const recovery = enable.data?.recoveryCodes ?? [];
  function confirmAuthenticator() {
    if (enable.isPending) return;
    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    enable.mutate(parsed.data, {
      onSuccess: () => {
        start.reset();
        setPassword("");
      },
    });
  }
  function disableAuthenticator() {
    if (disable.isPending) return;
    const parsed = totpDisableSchema.safeParse({ password, code });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    disable.mutate(parsed.data, {
      onSuccess: () => {
        setPassword("");
        setCode("");
      },
    });
  }
  function startAuthenticator() {
    if (start.isPending) return;
    const parsed = totpPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    start.mutate(parsed.data);
  }
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
            <Button disabled={enable.isPending} onClick={confirmAuthenticator}>
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
              onClick={disableAuthenticator}
            >
              Disable authenticator
            </Button>
          </>
        ) : (
          <Button disabled={start.isPending} onClick={startAuthenticator}>
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
