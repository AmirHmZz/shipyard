import { ShieldCheck } from "lucide-react";

import { InputField } from "@/components/InputField";
import { CopyButton } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { useSecurityForm } from "../hooks";
export type SecurityControlsProps = {
  controller: ReturnType<typeof useSecurityForm>;
  enabled: boolean;
};
export function SecurityControls({
  controller,
  enabled,
}: SecurityControlsProps) {
  const { code } = controller.state;
  const { setup, start, enable, disable } = controller.derived;
  const {
    changeCode,
    confirmAuthenticator,
    disableAuthenticator,
    startAuthenticator,
  } = controller.handlers;
  if (setup)
    return (
      <>
        <Alert>
          <AlertDescription>
            <p className="mb-2">
              Add this secret to your authenticator, then enter its six-digit
              code.
            </p>
            <code className="break-all text-xs">{setup.secret}</code>
          </AlertDescription>
        </Alert>
        <CopyButton value={setup.url} label="Copy authenticator URL" />
        <InputField
          label={<>Authenticator code</>}
          labelProps={{}}
          inputProps={{
            inputMode: "numeric",
            value: code,
            onChange: changeCode,
          }}
        />
        <Button disabled={enable.isPending} onClick={confirmAuthenticator}>
          Confirm authenticator
        </Button>
      </>
    );
  if (enabled)
    return (
      <>
        <InputField
          label={<>Authenticator / recovery code</>}
          labelProps={{}}
          inputProps={{ value: code, onChange: changeCode }}
        />
        <Button
          variant="destructive"
          disabled={disable.isPending}
          onClick={disableAuthenticator}
        >
          Disable authenticator
        </Button>
      </>
    );
  return (
    <Button disabled={start.isPending} onClick={startAuthenticator}>
      <ShieldCheck />
      Set up authenticator
    </Button>
  );
}
