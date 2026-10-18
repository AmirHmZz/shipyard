import { ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage, post, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { loadComposeEditor } from "@/lib/feature-loaders";
import type { components } from "@/lib/schema";
import { composeSourceSchema } from "@/lib/validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Save } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const Editor = lazy(loadComposeEditor);
type Source = components["schemas"]["ComposeSource"];

function SourceEditor({
  pending,
  error,
  draft,
  disabled,
  onChange,
}: {
  pending: boolean;
  error: unknown;
  draft: Source | null;
  disabled: boolean;
  onChange: (yaml: string) => void;
}) {
  if (pending) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!draft) return null;
  return (
    <Suspense fallback={<Loading />}>
      <Editor value={draft.yaml} disabled={disabled} onChange={onChange} />
    </Suspense>
  );
}

export function ComposeSource({
  app,
  onDeploy,
}: {
  app: Resource;
  onDeploy: (id: string) => void;
}) {
  const changes = useConfigurationChanges();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["compose-source", app.id, app.version],
    queryFn: () => api<Source>(`/applications/${app.id}/compose`),
    enabled: app.canWrite,
  });
  const [editedDraft, setDraft] = useState<Source | null>(null);
  const draft = editedDraft ?? q.data ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function reload() {
    try {
      const result = await q.refetch();
      if (result.error) throw result.error;
      if (result.data) {
        changes.saved();
        setDraft(result.data);
        setError("");
        setSaved(false);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save(deploy: boolean) {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<Source>(`/applications/${app.id}/compose`, {
        method: "PUT",
        body: JSON.stringify(composeSourceSchema.parse(draft)),
      });
      changes.saved();
      setDraft(result);
      setSaved(true);
      const refresh = client.invalidateQueries({ queryKey: ["resources"] });
      if (deploy) {
        const [d] = await Promise.all([
          post<{ id: string }>(`/applications/${app.id}/deploy`, {
            version: result.version,
          }),
          refresh,
        ]);
        changes.saved();
        onDeploy(d.id);
      } else await refresh;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!app.canWrite) return null;
  return (
    <Card className="min-w-0 shadow-none">
      <CardHeader>
        <CardTitle>Compose source</CardTitle>
        <CardDescription>
          Edit the saved document. Saving does not change running containers
          until you deploy. Values are encrypted; only operators can open this
          editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SourceEditor
          pending={q.isPending}
          error={q.error}
          draft={draft}
          disabled={busy}
          onChange={(yaml) => {
            if (yaml === draft?.yaml) return;
            changes.change();
            setDraft((current) => {
              const source = current ?? draft;
              return source ? { ...source, yaml } : source;
            });
            setSaved(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Use images or inline Dockerfiles. Referenced host files must have
          absolute paths. Configure variables in the Variables tab and route
          service ports under Domains. Compose ports declarations are ignored;
          host publishing requires administrator-controlled Published ports
          settings.
        </p>
        {q.data && draft && q.data.version !== draft.version && (
          <Alert>
            <AlertDescription>
              The saved application changed. Reload before overwriting another
              operator's changes.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && !error && (
          <p role="status" className="text-sm text-primary">
            Compose document saved.
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved document
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !draft?.yaml.trim()}
              onClick={() => void save(false)}
            >
              {busy ? <Spinner className="size-4 " /> : <Save />}Save
            </Button>
            <Button
              disabled={busy || !draft?.yaml.trim()}
              onClick={() => void save(true)}
            >
              <Play />
              Save &amp; deploy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
