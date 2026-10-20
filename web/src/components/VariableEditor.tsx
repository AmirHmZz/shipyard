import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { VariableController } from "./variables";
export type VariableEditorProps = {
  controller: VariableController;
};
export function VariableEditor({ controller }: VariableEditorProps) {
  const { key, value, scope, editing } = controller.state;
  const { secretKeys, isSecret, buildScope, busy } = controller.derived;
  const {
    setScope,
    setSecret,
    submitEditor,
    changeKey,
    changeValue,
    cancelEditor,
  } = controller.handlers;
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-5">
        <form onSubmit={submitEditor} className="space-y-4">
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
            <InputField
              label={<>Variable name</>}
              labelProps={{ htmlFor: "var-key" }}
              inputProps={{
                id: "var-key",
                className: "font-mono",
                placeholder: "API_KEY",
                pattern: "[A-Za-z_][A-Za-z0-9_]*",
                value: key,
                onChange: changeKey,
                required: true,
                disabled: busy || !!editing,
              }}
            />
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
              onChange={changeValue}
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
                onClick={cancelEditor}
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
