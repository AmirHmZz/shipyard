import { Play, Save } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import type { Resource } from "@/lib/api/types";

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
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { loadComposeEditor } from "@/lib/feature-loaders";

import type { Source } from "../generics";

import { composeSourceSchema } from "../generics";
import {
  useComposeSource,
  useSaveComposeSource,
  useDeployComposeSource,
} from "../hooks";

const Editor = lazy(loadComposeEditor);

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
  const q = useComposeSource(app);
  const saveSource = useSaveComposeSource(app.id);
  const deploySource = useDeployComposeSource(app.id);
  const [editedDraft, setDraft] = useState<Source | null>(null);
  const draft = editedDraft ?? q.data ?? null;
  const busy = saveSource.isPending || deploySource.isPending;
  const failure = saveSource.error ?? deploySource.error ?? q.error;
  const error = failure ? describeError(failure) : "";
  const [saved, setSaved] = useState(false);
  async function reload() {
    const result = await q.refetch();
    if (!result.error && result.data) {
      changes.saved();
      setDraft(result.data);
      saveSource.reset();
      deploySource.reset();
      setSaved(false);
    }
  }
  function save(deploy: boolean) {
    if (!draft || busy) return;
    const parsed = composeSourceSchema.safeParse(draft);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveSource.reset();
    deploySource.reset();
    setSaved(false);
    saveSource.mutate(parsed.data, {
      onSuccess: (result) => {
        changes.saved();
        setDraft(result);
        setSaved(true);
        if (deploy) {
          deploySource.mutate(
            { version: result.version },
            {
              onSuccess: (deployment) => {
                changes.saved();
                onDeploy(deployment.id);
              },
            },
          );
        }
      },
    });
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
