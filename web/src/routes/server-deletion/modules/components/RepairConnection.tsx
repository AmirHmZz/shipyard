import type { Resource } from "@/lib/api/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { useRepairConnectionForm } from "../hooks";

export function RepairConnection({
  server,
  onSaved,
}: {
  server: Resource;
  onSaved: () => void;
}) {
  const { state, derived, handlers } = useRepairConnectionForm(server, onSaved);
  const { host, port, user, fingerprint, auth, credential } = state;
  const { busy, error } = derived;
  const {
    setHost,
    setPort,
    setUser,
    setFingerprint,
    setCredential,
    setAuth,
    submitRepair,
  } = handlers;
  const fields = [
    { label: "SSH host", value: host, setValue: setHost },
    { label: "SSH port", value: port, setValue: setPort },
    { label: "SSH user", value: user, setValue: setUser },
    {
      label: "Verified host fingerprint",
      value: fingerprint,
      setValue: setFingerprint,
    },
  ];
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base" role="heading" aria-level={2}>
          Repair SSH connection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submitRepair}>
          <p className="text-sm text-muted-foreground">
            The repaired connection must reach the same Docker daemon. Leave the
            credential blank to keep its saved value.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(({ label, value, setValue }) => (
              <div key={String(label)} className="space-y-2">
                <Label htmlFor={String(label)}>{String(label)}</Label>
                <Input
                  id={String(label)}
                  value={String(value)}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-auth">Authentication</Label>
            <Select value={auth} onValueChange={setAuth}>
              <SelectTrigger id="repair-auth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private_key">
                  Private key (recommended)
                </SelectItem>
                <SelectItem value="password">Password</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-credential">
              {auth === "password" ? "Password" : "Private key"}
            </Label>
            {auth === "password" ? (
              <Input
                id="repair-credential"
                type="password"
                autoComplete="new-password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              />
            ) : (
              <Textarea
                id="repair-credential"
                className="font-mono"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              />
            )}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="outline" disabled={busy}>
            {busy && <Spinner className="size-4 " />}Verify & save connection
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
