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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { VariableController } from "./variables";
export function VariableEditor({
  controller,
}: {
  controller: VariableController;
}) {
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
