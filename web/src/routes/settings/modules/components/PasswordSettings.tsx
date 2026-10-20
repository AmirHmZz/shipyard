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

import { usePasswordForm } from "../hooks";

export function PasswordSettings() {
  const { state, derived, handlers } = usePasswordForm();
  const { current, password, code } = state;
  const { busy } = derived;
  const { setCurrent, setPassword, setCode, submitPassword } = handlers;
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
