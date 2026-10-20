import type { FormEvent } from "react";

import { useState } from "react";

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

import { passwordFormSchema } from "../generics";
import { useChangePassword } from "../hooks";

export function PasswordSettings() {
  const change = useChangePassword();
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const busy = change.isPending;
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = passwordFormSchema.safeParse({ current, password, code });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    change.mutate(parsed.data, {
      onSuccess: () => {
        setCurrent("");
        setPassword("");
        setCode("");
      },
    });
  }
  return (
    <Card className="mt-5 max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Other sessions will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submitPassword}>
          <div className="space-y-2">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              autoComplete="current-password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-new">New password</Label>
            <Input
              id="password-new"
              autoComplete="new-password"
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-code">
              Authenticator / recovery code (if enabled)
            </Label>
            <Input
              id="password-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button disabled={busy}>Change password</Button>
        </form>
      </CardContent>
    </Card>
  );
}
