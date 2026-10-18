import { DialogFooter } from "@/components/configuration-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type DNSRecord, type Resource } from "@/lib/api";
import { useNavigate } from "react-router";

export function DNSRecordForm({
  edit,
  setEdit,
  extra,
  setExtra,
  busy,
  save,
  navigate,
  zone,
}: {
  edit: DNSRecord;
  setEdit: (value: DNSRecord) => void;
  extra: string;
  setExtra: (value: string) => void;
  busy: boolean;
  save: () => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
  zone: Resource;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Label>Type</Label>
      <Select
        value={edit.type}
        onValueChange={(v) => setEdit({ ...edit, type: v })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"].map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={edit.name}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Content</Label>
        <Input
          value={edit.content}
          onChange={(e) => setEdit({ ...edit, content: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>TTL (1 = automatic)</Label>
          <Input
            type="number"
            value={edit.ttl}
            onChange={(e) => setEdit({ ...edit, ttl: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Input
            type="number"
            value={edit.priority ?? ""}
            onChange={(e) =>
              setEdit({
                ...edit,
                priority: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label>Provider proxy enabled</Label>
        <Switch
          checked={edit.proxied}
          onCheckedChange={(v) => setEdit({ ...edit, proxied: v })}
        />
      </div>
      <div className="space-y-2">
        <Label>Provider value / structured data (JSON)</Label>
        <Textarea
          className="font-mono text-xs"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Use this for SRV/CAA and ArvanCloud multi-value records.
        </p>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/dns/${zone.id}`)}
        >
          Cancel
        </Button>
        <Button disabled={busy}>Save record</Button>
      </DialogFooter>
    </form>
  );
}
