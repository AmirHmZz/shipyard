import type * as React from "react";
import type { FormEvent } from "react";

import { Trash2 } from "lucide-react";
import { Link } from "react-router";

import { InputField } from "@/components/InputField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

import type { Plan } from "../generics";

import { Inventory } from "./Inventory";

export type ServerDeletionPlanReviewProps = {
  plan: Plan | null;
  name: string;
  setName: (value: string) => void;
  ack: boolean;
  setAck: (value: boolean) => void;
  busy: boolean;
  submitConfirmation: (event: FormEvent<HTMLFormElement>) => void;
};
export function ServerDeletionPlanReview({
  plan,
  name,
  setName,
  ack,
  setAck,
  busy,
  submitConfirmation,
}: ServerDeletionPlanReviewProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setName(e.target.value);
  }
  function handleCheckboxCheckedChange(v: boolean | "indeterminate") {
    return setAck(v === true);
  }

  return (
    <>
      {plan && (
        <>
          {plan.blockers.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <p className="mb-2 font-medium">
                  Resolve these conflicts before deletion:
                </p>
                <ul className="list-disc flex flex-col gap-1 pl-5">
                  {plan.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <Inventory title="Will be removed" items={plan.remove} />
          <Inventory title="Will remain on the host" items={plan.preserve} />
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base" role="heading" aria-level={2}>
                Confirm server deletion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-5"
                onSubmit={submitConfirmation}
              >
                <InputField
                  label={<>Type {plan.serverName} to confirm</>}
                  labelProps={{ htmlFor: "delete-server-name" }}
                  inputProps={{
                    id: "delete-server-name",
                    value: name,
                    onChange: handleInputChange,
                    autoComplete: "off",
                    disabled: busy,
                  }}
                />
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="delete-server-volumes"
                    checked={ack}
                    onCheckedChange={handleCheckboxCheckedChange}
                    disabled={busy}
                  />
                  <Label htmlFor="delete-server-volumes" className="leading-5">
                    I understand that owned application volumes and their data
                    will be permanently deleted.
                  </Label>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="outline" asChild>
                    <Link to="/servers">Cancel</Link>
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={
                      busy ||
                      name !== plan.serverName ||
                      !ack ||
                      plan.blockers.length > 0
                    }
                  >
                    {busy ? <Spinner className="size-4" /> : <Trash2 />}
                    Delete server
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
