import type * as React from "react";

import type { Resource } from "@/lib/api/types";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { useRepairConnectionForm } from "../hooks";

export type RepairConnectionProps = {
  server: Resource;
  onSaved: () => void;
};
export function RepairConnection({ server, onSaved }: RepairConnectionProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setCredential(e.target.value);
  }
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    return setCredential(e.target.value);
  }

  const { state, derived, handlers } = useRepairConnectionForm(server, onSaved);
  const { auth, credential } = state;
  const { busy, error, fields } = derived;
  const { setCredential, setAuth, submitRepair, handleFieldChange } = handlers;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base" role="heading" aria-level={2}>
          Repair SSH connection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submitRepair}>
          <p className="text-sm text-muted-foreground">
            The repaired connection must reach the same Docker daemon. Leave the
            credential blank to keep its saved value.
          </p>
          <div
            className="grid gap-4 sm:grid-cols-2"
            onChange={handleFieldChange}
          >
            {fields.map(({ label, value, field }) => (
              <InputField
                key={String(label)}
                label={<>{String(label)}</>}
                labelProps={{ htmlFor: String(label) }}
                inputProps={{
                  id: String(label),
                  value: String(value),
                  "data-repair-field": field,
                  required: true,
                }}
              />
            ))}
          </div>
          <FormField
            label={<>Authentication</>}
            labelProps={{ htmlFor: "repair-auth" }}
          >
            <Select value={auth} onValueChange={setAuth}>
              <SelectTrigger id="repair-auth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private_key">
                  Private key (recommended)
                </SelectItem>
                <SelectItem value="password">Password</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label={<>{auth === "password" ? "Password" : "Private key"}</>}
            labelProps={{ htmlFor: "repair-credential" }}
          >
            {auth === "password" ? (
              <Input
                id="repair-credential"
                type="password"
                autoComplete="new-password"
                value={credential}
                onChange={handleInputChange}
              />
            ) : (
              <Textarea
                id="repair-credential"
                className="font-mono"
                value={credential}
                onChange={handleTextareaChange}
              />
            )}
          </FormField>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="self-start"
            type="submit"
            variant="outline"
            disabled={busy}
          >
            {busy && <Spinner className="size-4" />}Verify & save connection
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
