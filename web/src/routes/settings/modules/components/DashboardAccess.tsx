import { ExternalLink, RefreshCw } from "lucide-react";

import { ConfigurationGuard } from "@/components/configuration-surface";
import { ErrorState, Loading, StateBadge } from "@/components/shared";
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

import type { State } from "../generics";

import { useDashboardAccessForm } from "../hooks";
export function DashboardAccess() {
  return (
    <ConfigurationGuard className="max-w-none">
      <DashboardAccessForm />
    </ConfigurationGuard>
  );
}
function DashboardAccessForm() {
  const { state: form, derived, handlers } = useDashboardAccessForm();
  const { draft, email, accept } = form;
  const { q, busy, error } = derived;
  const { setDraft, setEmail, setAccept, save } = handlers;
  if (!q.data) {
    if (q.error) return <ErrorState error={q.error} />;
    return <Loading />;
  }
  const state = q.data;
  return (
    <>
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
            <DashboardHostnameForm
              state={state}
              draft={draft}
              setDraft={setDraft}
              email={email}
              setEmail={setEmail}
              accept={accept}
              setAccept={setAccept}
              busy={busy}
              save={save}
            />
            {state.domain && (
              <DashboardAccessStatus
                state={state}
                busy={busy}
                retry={() => void save(true)}
              />
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
    </>
  );
}

function DashboardAccessStatus({
  state,
  busy,
  retry,
}: {
  state: State;
  busy: boolean;
  retry: () => void;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <p className="font-medium break-all">{state.domain}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["dns", "propagation", "certificate", "routing"] as const).map(
          (key) => (
            <div key={key}>
              <p className="mb-2 text-xs capitalize text-muted-foreground">
                {key}
              </p>
              <StateBadge state={state.status?.[key] || "pending"} />
            </div>
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={retry}>
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
  );
}

function DashboardHostnameForm({
  state,
  draft,
  setDraft,
  email,
  setEmail,
  accept,
  setAccept,
  busy,
  save,
}: {
  state: State;
  draft: string | null;
  setDraft: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  accept: boolean;
  setAccept: (value: boolean) => void;
  busy: boolean;
  save: () => void;
}) {
  return (
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
          DNS is managed manually for this hostname. Certificate issuance and
          renewal use HTTP validation on public port 80.
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
          busy || !(draft ?? state.domain) || (!state.acmeConfigured && !accept)
        }
      >
        {busy && <Spinner className="size-4 " />}Save hostname
      </Button>
    </form>
  );
}
