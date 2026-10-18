import { useRepairServerConnection } from "../hooks";
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
import { errorMessage, text, type Resource } from "@/lib/api";
import { serverConnectionSchema } from "@/lib/validation";
import { useState } from "react";

export function RepairConnection({
  server,
  onSaved,
}: {
  server: Resource;
  onSaved: () => void;
}) {
  const repair = useRepairServerConnection(server.id);
  const [host, setHost] = useState(() => text(server.data, "host"));
  const [port, setPort] = useState(String(server.data.port || 22));
  const [user, setUser] = useState(() => text(server.data, "user"));
  const [fingerprint, setFingerprint] = useState(() =>
    text(server.data, "fingerprint"),
  );
  const [auth, setAuth] = useState(() =>
    text(server.data, "authMethod", "private_key"),
  );
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base" role="heading" aria-level={2}>
          Repair SSH connection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const connection = serverConnectionSchema.parse({
                host,
                port,
                user,
                fingerprint,
                authMethod: auth,
                credential,
              });
              await repair.mutateAsync({
                host: connection.host,
                port: connection.port,
                user: connection.user,
                fingerprint: connection.fingerprint,
                authMethod: connection.authMethod,
                secrets: connection.credential
                  ? {
                      [connection.authMethod === "password"
                        ? "password"
                        : "private_key"]: connection.credential,
                    }
                  : {},
              });
              setCredential("");
              onSaved();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            The repaired connection must reach the same Docker daemon. Leave the
            credential blank to keep its saved value.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["SSH host", host, setHost],
              ["SSH port", port, setPort],
              ["SSH user", user, setUser],
              ["Verified host fingerprint", fingerprint, setFingerprint],
            ].map(([label, value, setter]) => (
              <div key={String(label)} className="space-y-2">
                <Label htmlFor={String(label)}>{String(label)}</Label>
                <Input
                  id={String(label)}
                  value={String(value)}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                  required
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair-auth">Authentication</Label>
            <Select
              value={auth}
              onValueChange={(v) => {
                setAuth(v);
                setCredential("");
              }}
            >
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
