import { ErrorState, Loading } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useDashboardAccessForm } from "../hooks";
import { DashboardAccessStatus } from "./DashboardAccessStatus";
import { DashboardHostnameForm } from "./DashboardHostnameForm";

export function DashboardAccessForm() {
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
          <CardContent className="flex flex-col gap-6">
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
