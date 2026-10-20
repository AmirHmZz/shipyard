import type { useQueryClient } from "@tanstack/react-query";

import { Trash2 } from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { APIError, errorMessage } from "@/lib/api";
import { resourceKeys } from "@/lib/query-keys";
import { serverDeletionSchema } from "@/lib/validation";

import type { Plan } from "../generics";

import { serverDeletionKeys } from "../generics";
import { confirmServerDeletion } from "../services";
import { Inventory } from "./Inventory";

export function ServerDeletionPlanReview({
  plan,
  setPlan,
  name,
  setName,
  ack,
  setAck,
  busy,
  setBusy,
  setError,
  id,
  client,
  review: _review,
}: {
  plan: Plan | null;
  setPlan: (value: Plan | null) => void;
  name: string;
  setName: (value: string) => void;
  ack: boolean;
  setAck: (value: boolean) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  id: string;
  client: ReturnType<typeof useQueryClient>;
  review: () => Promise<void>;
}) {
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
                <ul className="list-disc space-y-1 pl-5">
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
                className="space-y-5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const confirmation = serverDeletionSchema(
                      plan.serverName,
                    ).parse({ planId: plan.id, name, deleteVolumes: ack });
                    await confirmServerDeletion(id, confirmation);
                    await Promise.all([
                      client.invalidateQueries({
                        queryKey: resourceKeys.all,
                      }),
                      client.invalidateQueries({
                        queryKey: serverDeletionKeys.status(id),
                      }),
                    ]);
                  } catch (e) {
                    setError(errorMessage(e));
                    if (e instanceof APIError && e.status === 409) {
                      setPlan(null);
                      setName("");
                      setAck(false);
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="delete-server-name">
                    Type {plan.serverName} to confirm
                  </Label>
                  <Input
                    id="delete-server-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                    disabled={busy}
                  />
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="delete-server-volumes"
                    checked={ack}
                    onCheckedChange={(v) => setAck(v === true)}
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
                    {busy ? <Spinner className="size-4 " /> : <Trash2 />}
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
