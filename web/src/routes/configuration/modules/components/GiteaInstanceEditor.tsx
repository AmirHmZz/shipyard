import { CopyValue } from "@/components/CopyValue";
import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";

import type { InstanceDraft } from "../generics";
import type { useSaveGiteaInstance } from "../hooks";

import { useGiteaInstanceEditor } from "../hooks";

export type GiteaInstanceEditorProps = {
  instanceForm: InstanceDraft;
  setInstanceForm: (value: InstanceDraft | null) => void;
  callback: string;
  busy: boolean;
  saveInstance: ReturnType<typeof useSaveGiteaInstance>;
  resetErrors: () => void;
  setInstanceId: (id: string) => void;
};
export function GiteaInstanceEditor({
  instanceForm,
  setInstanceForm,
  callback,
  busy,
  saveInstance,
  resetErrors,
  setInstanceId,
}: GiteaInstanceEditorProps) {
  const { handlers } = useGiteaInstanceEditor({
    instanceForm,
    setInstanceForm,
    busy,
    saveInstance,
    resetErrors,
    setInstanceId,
  });
  const { cancel, changeField, save } = handlers;
  return (
    <section
      aria-label="Gitea OAuth application"
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <p className="text-sm text-muted-foreground">
        Once per Gitea instance, register a confidential OAuth2 application
        under Settings → Applications. Use the callback URL below, then copy its
        client ID and client secret. Gitea 1.23 or newer is required.
      </p>
      <CopyValue
        value={callback || ""}
        label="Copy OAuth callback URL"
        placeholder="Loading callback URL…"
      />
      {(
        [
          ["name", "Instance name"],
          ["url", "Instance URL"],
          ["clientId", "Client ID"],
          ["clientSecret", "Client secret"],
        ] as const
      ).map(([key, label]) => (
        <InputField
          key={key}
          label={<>{label}</>}
          labelProps={{ htmlFor: `gitea-${key}` }}
          inputProps={{
            id: `gitea-${key}`,
            type: key === "clientSecret" ? "password" : "text",
            autoComplete: "off",
            value: instanceForm[key],
            placeholder:
              key === "clientSecret" && instanceForm.id
                ? "Leave empty to keep saved secret"
                : undefined,
            "data-gitea-field": key,
            onChange: changeField,
          }}
        />
      ))}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>
          Save instance
        </Button>
        <Button variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
