import type { Dispatch, SetStateAction } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { CopyButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { giteaInstanceSchema } from "@/lib/validation";

import type { InstanceDraft } from "../generics";

import { configurationKeys } from "../generics";
import { saveGiteaInstance } from "../services";

export function GiteaInstanceEditor({
  instanceForm,
  setInstanceForm,
  callback,
  busy,
  perform,
  setInstanceId,
  client,
}: {
  instanceForm: InstanceDraft;
  setInstanceForm: Dispatch<SetStateAction<InstanceDraft | null>>;
  callback: string;
  busy: boolean;
  perform: (action: () => Promise<void>) => Promise<void>;
  setInstanceId: (id: string) => void;
  client: ReturnType<typeof useQueryClient>;
}) {
  return (
    <section
      aria-label="Gitea OAuth application"
      className="space-y-4 rounded-lg border p-4"
    >
      <p className="text-sm text-muted-foreground">
        Once per Gitea instance, register a confidential OAuth2 application
        under Settings → Applications. Use the callback URL below, then copy its
        client ID and client secret. Gitea 1.23 or newer is required.
      </p>
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
        <code className="w-full min-w-0 break-all text-xs sm:w-auto sm:flex-1">
          {callback || "Loading callback URL…"}
        </code>
        {callback && (
          <CopyButton label="Copy OAuth callback URL" value={callback} />
        )}
      </div>
      {(
        [
          ["name", "Instance name"],
          ["url", "Instance URL"],
          ["clientId", "Client ID"],
          ["clientSecret", "Client secret"],
        ] as const
      ).map(([key, label]) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`gitea-${key}`}>{label}</Label>
          <Input
            id={`gitea-${key}`}
            type={key === "clientSecret" ? "password" : "text"}
            autoComplete="off"
            value={instanceForm[key]}
            placeholder={
              key === "clientSecret" && instanceForm.id
                ? "Leave empty to keep saved secret"
                : undefined
            }
            onChange={(e) =>
              setInstanceForm((current) =>
                current ? { ...current, [key]: e.target.value } : current,
              )
            }
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const v = await saveGiteaInstance(
                giteaInstanceSchema.parse(instanceForm),
              );
              setInstanceId(v.id);
              setInstanceForm(null);
              await client.invalidateQueries({
                queryKey: configurationKeys.giteaInstances,
              });
            })
          }
        >
          Save instance
        </Button>
        <Button variant="outline" onClick={() => setInstanceForm(null)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
