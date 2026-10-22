import type { useNavigate } from "react-router";

import type { DNSRecord, Resource } from "@/lib/api/types";

import { DialogFooter } from "@/components/ConfigurationSurface";
import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { DNSRecordFormValues } from "../generics";

import { useDNSRecordForm } from "../hooks";

export type DNSRecordFormProps = {
  edit: DNSRecord;
  setEdit: (value: DNSRecord) => void;
  extra: string;
  setExtra: (value: string) => void;
  busy: boolean;
  pendingRecord: DNSRecordFormValues | undefined;
  save: () => void;
  navigate: ReturnType<typeof useNavigate>;
  zone: Resource;
};
export function DNSRecordForm({
  edit,
  setEdit,
  extra,
  setExtra,
  busy,
  pendingRecord,
  save,
  navigate,
  zone,
}: DNSRecordFormProps) {
  const { handlers } = useDNSRecordForm({ edit, setEdit, setExtra, save });
  const {
    handleSubmit,
    changeType,
    changeName,
    changeContent,
    changeTTL,
    changePriority,
    changeProxy,
    changeExtra,
  } = handlers;
  function cancel() {
    navigate("/dns/" + zone.id);
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Label>Type</Label>
      <SelectControl
        value={edit.type}
        onValueChange={changeType}
        options={["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"]}
        triggerProps={{ className: "w-full" }}
      />
      <InputField
        label={<>Name</>}
        labelProps={{}}
        inputProps={{ value: edit.name, onChange: changeName, required: true }}
      />
      <InputField
        label={<>Content</>}
        labelProps={{}}
        inputProps={{ value: edit.content, onChange: changeContent }}
      />
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label={<>TTL (1 = automatic)</>}
          labelProps={{}}
          inputProps={{ type: "number", value: edit.ttl, onChange: changeTTL }}
        />
        <InputField
          label={<>Priority</>}
          labelProps={{}}
          inputProps={{
            type: "number",
            value: edit.priority ?? "",
            onChange: changePriority,
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label>Provider proxy enabled</Label>
        <Switch checked={edit.proxied} onCheckedChange={changeProxy} />
      </div>
      <FormField
        label={<>Provider value / structured data (JSON)</>}
        labelProps={{}}
      >
        <Textarea
          className="font-mono text-xs"
          value={extra}
          onChange={changeExtra}
        />
        <p className="text-xs text-muted-foreground">
          Use this for SRV/CAA and ArvanCloud multi-value records.
        </p>
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={cancel}>
          Cancel
        </Button>
        <Button disabled={busy}>{busy && <Spinner />}Save record</Button>
      </DialogFooter>
      {busy && pendingRecord && (
        <p role="status" className="text-xs text-muted-foreground">
          Saving {pendingRecord.type} record {pendingRecord.name}…
        </p>
      )}
    </form>
  );
}
