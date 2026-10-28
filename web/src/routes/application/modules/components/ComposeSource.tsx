import { Play, Save } from "lucide-react";

import type { Resource } from "@/lib/api/types";

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

import { useComposeSourceForm } from "../hooks";
import { SourceEditor } from "./SourceEditor";

export type ComposeSourceProps = {
  app: Resource;
  onDeploy: (id: string) => void;
};

export function ComposeSource({ app, onDeploy }: ComposeSourceProps) {
  const { state, derived, handlers } = useComposeSourceForm(app, onDeploy);
  const { draft } = state;
  const { q, busy, error, saved } = derived;
  const { changeYaml, reloadSource, saveOnly, saveAndDeploy } = handlers;
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
      <CardContent className="flex flex-col gap-4">
        <SourceEditor
          pending={q.isPending}
          error={q.error}
          draft={draft}
          disabled={busy}
          onChange={changeYaml}
        />
        <p className="text-xs text-muted-foreground">
          With Git, relative build contexts and files use the selected
          repository build context. Without Git, use images or inline
          Dockerfiles and absolute host paths. Configure variables in the
          Variables tab and route service ports under Domains. Compose ports
          declarations are ignored; host publishing requires
          administrator-controlled Published ports settings.
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
          <Button variant="outline" disabled={busy} onClick={reloadSource}>
            Reload saved document
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !draft?.yaml.trim()}
              onClick={saveOnly}
            >
              {busy ? <Spinner className="size-4" /> : <Save />}Save
            </Button>
            <Button
              disabled={busy || !draft?.yaml.trim()}
              onClick={saveAndDeploy}
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
