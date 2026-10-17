import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Save } from "lucide-react";
import { api, post, errorMessage, type Resource } from "@/lib/api";
import type { components } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loading, ErrorState } from "@/components/shared";

const Editor = lazy(() => import("./compose-code-editor"));
type Source = components["schemas"]["ComposeSource"];

export function ComposeSource({
  app,
  onDeploy,
}: {
  app: Resource;
  onDeploy: (id: string) => void;
}) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["compose-source", app.id, app.version],
    queryFn: () => api<Source>(`/applications/${app.id}/compose`),
    enabled: app.canWrite,
  });
  const [draft, setDraft] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data);
  }, [q.data, draft]);
  async function reload() {
    try {
      const result = await q.refetch();
      if (result.error) throw result.error;
      if (result.data) {
        window.dispatchEvent(new Event("configuration-saved"));
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
        body: JSON.stringify(draft),
      });
      window.dispatchEvent(new Event("configuration-saved"));
      setDraft(result);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ["resources"] });
      if (deploy) {
        const d = await post<{ id: string }>(`/applications/${app.id}/deploy`, {
          version: result.version,
        });
        onDeploy(d.id);
      }
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
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          draft && (
            <Suspense fallback={<Loading />}>
              <Editor
                value={draft.yaml}
                disabled={busy}
                onChange={(yaml) => {
                  window.dispatchEvent(new Event("configuration-dirty"));
                  setDraft({ ...draft, yaml });
                  setSaved(false);
                }}
              />
            </Suspense>
          )
        )}
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
              {busy ? <Loader2 className="animate-spin" /> : <Save />}Save
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
