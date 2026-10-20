import { KeyRound } from "lucide-react";

import type { Session } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
import { CopyButton, StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useSecurityForm } from "../hooks";
import { SecurityControls } from "./SecurityControls";
export type SecurityProps = { session: Session };
export function Security({ session }: SecurityProps) {
  const controller = useSecurityForm();
  const { password } = controller.state;
  const { recovery } = controller.derived;
  const { changePassword } = controller.handlers;
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-primary/5">
          <KeyRound className="size-5 text-primary" />
        </div>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription>
          Add an authenticator to your local account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StateBadge state={session.user.totp ? "enabled" : "not configured"} />
        <InputField
          label={<>Current password</>}
          labelProps={{}}
          inputProps={{
            type: "password",
            value: password,
            onChange: changePassword,
          }}
        />
        <SecurityControls controller={controller} enabled={session.user.totp} />
        {!!recovery.length && (
          <Alert>
            <AlertDescription>
              <p className="mb-3">
                Save these recovery codes now. Each can be used once.
              </p>
              <pre className="text-xs">{recovery.join("\n")}</pre>
              <div className="mt-3">
                <CopyButton
                  value={recovery.join("\n")}
                  label="Copy recovery codes"
                />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
