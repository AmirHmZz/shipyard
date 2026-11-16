import { KeyRound, Plus, Save } from "lucide-react";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { SettingsSection } from "@/components/SettingsSection";
import { Button } from "@/components/ui/button";
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
    <SettingsSection
      title={editing ? "Edit variable" : "Add a variable"}
      description={
        editing
          ? "Update the value or change how it is stored."
          : "Choose a scope, then add a name and value."
      }
      icon={<KeyRound />}
    >
      <div className="p-5">
        <form onSubmit={submitEditor} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <FormField label={<>Scope</>} labelProps={{ htmlFor: "var-scope" }}>
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
            </FormField>
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
          {editing && secretKeys.has(editing) && (
            <p className="text-sm text-muted-foreground">
              Enter a replacement value. The stored secret is never returned.
            </p>
          )}
          <FormField
            label={
              <>
                {editing && secretKeys.has(editing)
                  ? "Replacement value"
                  : "Value"}
              </>
            }
            labelProps={{ htmlFor: "var-value" }}
          >
            <Textarea
              id="var-value"
              className="min-h-28 font-mono text-xs"
              value={value}
              onChange={changeValue}
              required={isSecret || secretKeys.has(scope + key)}
              disabled={busy}
            />
          </FormField>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="var-secret">Secret</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Encrypted and never returned.
                {buildScope && " Required for build secrets."}
              </p>
            </div>
            <Switch
              id="var-secret"
              checked={isSecret}
              onCheckedChange={setSecret}
              disabled={busy || buildScope}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button disabled={busy}>
              {busy && <Spinner className="size-4" />}
              {!busy && editing && <Save />}
              {!busy && !editing && <Plus />}
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
      </div>
    </SettingsSection>
  );
}
