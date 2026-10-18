import { Confirm } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
function useVariableController(resource: Resource) {
  const changes = useConfigurationChanges();
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("env:");
  const [secret, setSecret] = useState(false);
  const [editing, setEditing] = useState("");
  const buildScope = scope === "build:" || scope === "preview-build:";
  const isSecret = buildScope || secret;
  const ordinary = resource.variables || {};
  const secretKeys = new Set(
    resource.secretKeys.filter((key) =>
      /^(env|build|preview-env|preview-build):/.test(key),
    ),
  );
  const keys = [...new Set([...Object.keys(ordinary), ...secretKeys])].sort();
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState("");
  function reset() {
    setKey("");
    setValue("");
    setEditing("");
    setSecret(false);
  }
  function edit(name: string) {
    const index = name.indexOf(":");
    setScope(name.slice(0, index + 1));
    setKey(name.slice(index + 1));
    setValue(secretKeys.has(name) ? "" : ordinary[name]);
    setSecret(secretKeys.has(name));
    setEditing(name);
  }
  async function save(name: string, v: string | null, encrypted: boolean) {
    setBusy(true);
    try {
      await api(`/resources/${resource.id}`, {
        method: "PUT",
        body: JSON.stringify({
          kind: resource.kind,
          name: resource.name,
          data: resource.data,
          version: resource.version,
          ...(encrypted
            ? { secrets: { [name]: v ?? "" } }
            : { variables: { [name]: v } }),
        }),
      });
      await client.invalidateQueries({ queryKey: ["resources"] });
      if (v !== null || editing === name) {
        reset();
        changes.saved();
      }
      setRemove("");
      toast.success(
        `Variable ${v === null ? "removed" : "saved"}. Deploy to apply it.`,
      );
    } catch (e) {
      if (v === null) throw e;
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    resource,
    changes,
    key,
    setKey,
    value,
    setValue,
    scope,
    setScope,
    secretKeys,
    isSecret,
    setSecret,
    buildScope,
    editing,
    busy,
    ordinary,
    keys,
    remove,
    setRemove,
    reset,
    edit,
    save,
  };
}
type VariableController = ReturnType<typeof useVariableController>;

export function Variables({ resource }: { resource: Resource }) {
  const controller = useVariableController(resource);
  const { remove, setRemove, save, secretKeys } = controller;
  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertDescription>
          Ordinary variables are visible to project readers. Only secrets are
          encrypted and never returned. Preview variables must be explicitly
          configured. Redeploy to apply changes.
        </AlertDescription>
      </Alert>
      {resource.canWrite && <VariableEditor controller={controller} />}
      <VariableTable controller={controller} />
      <Confirm
        open={!!remove}
        onOpenChange={(v) => !v && setRemove("")}
        title="Remove variable?"
        description={`${remove} will be removed from this scope. Redeploy applications to apply the change.`}
        destructive
        onConfirm={() => save(remove, null, secretKeys.has(remove))}
      />
    </div>
  );
}

function VariableEditor({ controller }: { controller: VariableController }) {
  const {
    key,
    setKey,
    value,
    setValue,
    scope,
    setScope,
    secretKeys,
    isSecret,
    setSecret,
    buildScope,
    editing,
    busy,
    changes,
    reset,
    save,
  } = controller;
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(scope + key, value, isSecret);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="var-scope">Scope</Label>
              <Select
                value={scope}
                onValueChange={setScope}
                disabled={busy || !!editing}
              >
                <SelectTrigger id="var-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env:">Runtime environment</SelectItem>
                  <SelectItem value="build:">BuildKit secret</SelectItem>
                  <SelectItem value="preview-env:">
                    Preview runtime environment
                  </SelectItem>
                  <SelectItem value="preview-build:">
                    Preview build secret
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="var-key">Variable name</Label>
              <Input
                id="var-key"
                className="font-mono"
                placeholder="API_KEY"
                pattern="[A-Za-z_][A-Za-z0-9_]*"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                disabled={busy || !!editing}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="var-secret"
              checked={isSecret}
              onCheckedChange={setSecret}
              disabled={busy || buildScope}
            />
            <Label htmlFor="var-secret">Secret</Label>
          </div>
          {editing && secretKeys.has(editing) && (
            <p className="text-sm text-muted-foreground">
              Enter a replacement value. The stored secret is never returned.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="var-value">
              {editing && secretKeys.has(editing)
                ? "Replacement value"
                : "Value"}
            </Label>
            <Textarea
              id="var-value"
              className="font-mono text-xs"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required={isSecret || secretKeys.has(scope + key)}
              disabled={busy}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={busy}>
              {busy && <Spinner className="size-4 " />}
              {editing ? "Save variable" : "Add / replace variable"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  reset();
                  changes.saved();
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VariableTable({ controller }: { controller: VariableController }) {
  const { resource, keys, secretKeys, ordinary, busy, edit, setRemove } =
    controller;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((name) => (
            <TableRow key={name}>
              <TableCell className="font-mono text-xs">{name}</TableCell>
              <TableCell className="max-w-sm whitespace-pre-wrap break-all font-mono text-xs">
                {secretKeys.has(name)
                  ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  : ordinary[name]}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${name}`}
                  disabled={busy || !resource.canWrite}
                  onClick={() => edit(name)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  disabled={busy || !resource.canWrite}
                  onClick={() => setRemove(name)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
