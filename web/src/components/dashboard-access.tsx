import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { components } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loading, ErrorState, StateBadge } from "@/components/shared";
import { ConfigurationGuard } from "@/components/configuration-surface";
type State = components["schemas"]["DashboardAccess"];
export function DashboardAccess() {
  const q = useQuery({
    queryKey: ["dashboard-access"],
    queryFn: () => api<State>("/settings/dashboard-access"),
    refetchInterval: 3000,
  });
  const [draft, setDraft] = useState<string | null>(null),
    [email, setEmail] = useState(""),
    [accept, setAccept] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!q.data) {
    if (q.error) return <ErrorState error={q.error} />;
    return <Loading />;
  }
  const state = q.data;
  async function save(retry = false) {
    setBusy(true);
    setError("");
    try {
      await api("/settings/dashboard-access" + (retry ? "/retry" : ""), {
        method: retry ? "POST" : "PUT",
        body: JSON.stringify(
          retry
            ? { version: state.version }
            : {
                version: state.version,
                domain: draft ?? state.domain,
                ...(!state.acmeConfigured
                  ? { acmeEmail: email, acceptTos: accept }
                  : {}),
              },
        ),
      });
      setDraft(null);
      window.dispatchEvent(new Event("configuration-saved"));
      await q.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConfigurationGuard className="max-w-none">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard access</CardTitle>
          <CardDescription>
            {state.enabled
              ? "Your dashboard uses HTTPS through this host's managed HAProxy. Point its DNS records directly to the public addresses configured under Servers → Local host."
              : "Automatic dashboard HTTPS requires the native Linux release installation. This development installation keeps its configured origin."}
          </CardDescription>
        </CardHeader>
        {state.enabled && (
          <CardContent className="space-y-6">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!state.acmeConfigured && !accept) return;
                void save();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="dashboard-domain">Dashboard hostname</Label>
                <Input
                  id="dashboard-domain"
                  required
                  placeholder="shipyard.example.com"
                  value={draft ?? state.domain}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  DNS is managed manually for this hostname. Certificate
                  issuance and renewal use HTTP validation on public port 80.
                </p>
              </div>
              {!state.acmeConfigured && (
                <div className="space-y-3">
                  <Label htmlFor="dashboard-email">
                    Certificate contact email (optional)
                  </Label>
                  <Input
                    id="dashboard-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="flex items-start gap-3">
                    <Switch
                      id="dashboard-consent"
                      checked={accept}
                      onCheckedChange={setAccept}
                    />
                    <Label htmlFor="dashboard-consent">
                      I accept the Let's Encrypt terms of service
                    </Label>
                    <a
                      href="https://letsencrypt.org/repository/"
                      className="text-sm underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read terms
                    </a>
                  </div>
                </div>
              )}
              <Button
                disabled={
                  busy ||
                  !(draft ?? state.domain) ||
                  (!state.acmeConfigured && !accept)
                }
              >
                {busy && <Loader2 className="animate-spin" />}Save hostname
              </Button>
            </form>
            {state.domain && (
              <section className="space-y-4 border-t pt-5">
                <p className="font-medium break-all">{state.domain}</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(
                    ["dns", "propagation", "certificate", "routing"] as const
                  ).map((key) => (
                    <div key={key}>
                      <p className="mb-2 text-xs capitalize text-muted-foreground">
                        {key}
                      </p>
                      <StateBadge state={state.status?.[key] || "pending"} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    <RefreshCw />
                    Retry setup
                  </Button>
                  <Button variant="outline" asChild>
                    <a
                      href={state.candidateOrigin + "/settings?tab=dashboard"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open dashboard
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </section>
            )}
            {(error || state.error || state.status?.error) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error || state.error || state.status?.error}
                </AlertDescription>
              </Alert>
            )}
            {q.error && (
              <p className="text-sm text-muted-foreground">
                Reconnecting. If you changed the hostname, open its new HTTPS
                address.
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </ConfigurationGuard>
  );
}
