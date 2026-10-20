import { Anchor, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

import { InputField } from "@/components/InputField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { describeError } from "@/lib/api/translate-error";

import type { useAuthForm } from "../hooks";
export type AuthFormProps = { controller: ReturnType<typeof useAuthForm> };
export function AuthForm({ controller }: AuthFormProps) {
  const { form } = controller.state;
  const { token, setup, status, busy, error, title, description, submitLabel } =
    controller.derived;
  const { changeField, submit } = controller.handlers;
  return (
    <Card className="w-full max-w-md border-none bg-transparent shadow-none">
      <CardHeader className="px-0">
        <div className="mb-7 flex items-center gap-2 lg:hidden">
          <Anchor className="size-6 text-primary" />
          <span className="text-xl font-semibold">shipyard.</span>
        </div>
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-card">
          <LockKeyhole className="size-5 text-primary" />
        </div>
        <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form className="space-y-5" onSubmit={submit}>
          {(setup || token) && (
            <InputField
              label={<>Full name</>}
              labelProps={{ htmlFor: "name" }}
              inputProps={{
                id: "name",
                autoComplete: "name",
                value: form.name,
                onChange: changeField,
                "data-auth-field": "name",
                required: true,
              }}
            />
          )}
          {!token && (
            <InputField
              label={<>Email address</>}
              labelProps={{ htmlFor: "email" }}
              inputProps={{
                id: "email",
                type: "email",
                autoComplete: "username",
                placeholder: "you@company.com",
                value: form.email,
                onChange: changeField,
                "data-auth-field": "email",
                required: true,
              }}
            />
          )}
          <InputField
            label={<>Password</>}
            labelProps={{ htmlFor: "password" }}
            inputProps={{
              id: "password",
              type: "password",
              minLength: setup ? 12 : 1,
              autoComplete: setup ? "new-password" : "current-password",
              value: form.password,
              onChange: changeField,
              "data-auth-field": "password",
              required: true,
            }}
          />
          {setup ? (
            <div className="space-y-2">
              <Label htmlFor="bootstrap">Bootstrap token</Label>
              <Input
                id="bootstrap"
                type="password"
                value={form.token}
                onChange={changeField}
                data-auth-field="token"
                required
              />
              <p className="text-xs text-muted-foreground">
                From SHIPYARD_BOOTSTRAP_TOKEN in your installation environment.
              </p>
            </div>
          ) : (
            <InputField
              label={
                <>
                  Authenticator / recovery code{" "}
                  <span className="text-muted-foreground">(if enabled)</span>
                </>
              }
              labelProps={{ htmlFor: "code" }}
              inputProps={{
                id: "code",
                autoComplete: "one-time-code",
                value: form.code,
                onChange: changeField,
                "data-auth-field": "code",
              }}
            />
          )}
          {(error || status.error) && (
            <Alert variant="destructive">
              <AlertDescription>
                {error || describeError(status.error)}
              </AlertDescription>
            </Alert>
          )}
          <Button className="h-11 w-full" disabled={busy || status.isPending}>
            {busy ? <Spinner className="size-4 " /> : null}
            {submitLabel}
            <ArrowRight className="ml-auto size-4" />
          </Button>
          <p className="flex items-center justify-center gap-2 pt-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Private access. Invitations only.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
