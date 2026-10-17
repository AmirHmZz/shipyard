import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, type Resource } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Confirm } from "@/components/shared";
export function Variables({ resource }: { resource: Resource }) {
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("env:");
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState("");
  async function save(name: string, v: string) {
    setBusy(true);
    try {
      await api(`/resources/${resource.id}`, {
        method: "PUT",
        body: JSON.stringify({
          kind: resource.kind,
          name: resource.name,
          data: resource.data,
          version: resource.version,
          secrets: { [name]: v },
        }),
      });
      await client.invalidateQueries({ queryKey: ["resources"] });
      setKey("");
      setValue("");
      window.dispatchEvent(new Event("configuration-saved"));
      toast.success("Variable saved. Deploy to apply it.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertDescription>
          Values are encrypted and never returned. Preview variables must be
          explicitly configured. Redeploy to apply changes.
        </AlertDescription>
      </Alert>
      {resource.canWrite && (
        <Card className="py-0 shadow-none">
          <CardContent className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(scope + key, value);
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="env:">Runtime environment</SelectItem>
                      <SelectItem value="build:">BuildKit secret</SelectItem>
                      <SelectItem value="preview-env:">
                        Preview runtime environment
                      </SelectItem>
                      <SelectItem value="preview-build:">
                        Preview build secret
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="var-key">Variable name</Label>
                  <Input
                    id="var-key"
                    className="font-mono"
                    placeholder="API_KEY"
                    pattern="[A-Za-z_][A-Za-z0-9_]*"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="var-value">Value</Label>
                <Textarea
                  id="var-value"
                  className="font-mono text-xs"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>
              <Button disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}Add / replace
                variable
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {resource.secretKeys
              .filter((k) => k.includes(":"))
              .map((k) => (
                <TableRow key={k}>
                  <TableCell className="font-mono text-xs">{k}</TableCell>
                  <TableCell className="text-muted-foreground">
                    ••••••••••••
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || !resource.canWrite}
                      onClick={() => setRemove(k)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
      <Confirm
        open={!!remove}
        onOpenChange={(v) => !v && setRemove("")}
        title="Remove variable?"
        description={`${remove} will be removed from this scope. Redeploy applications to apply the change.`}
        destructive
        onConfirm={() => save(remove, "")}
      />
    </div>
  );
}
