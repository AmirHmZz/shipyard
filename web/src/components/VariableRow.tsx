import { LockKeyhole, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

const scopeLabels: Record<string, string> = {
  env: "Runtime environment",
  build: "BuildKit secret",
  "preview-env": "Preview runtime",
  "preview-build": "Preview build secret",
};

export type VariableRowProps = {
  name: string;
  value?: string;
  secret: boolean;
  disabled: boolean;
};

export function VariableRow({
  name,
  value,
  secret,
  disabled,
}: VariableRowProps) {
  const separator = name.indexOf(":");
  const scope = name.slice(0, separator);
  const label = separator < 0 ? name : name.slice(separator + 1);
  return (
    <TableRow>
      <TableCell className="whitespace-normal py-4 align-top">
        <p className="break-all font-mono text-xs font-medium">{label}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {scopeLabels[scope] || scope}
        </p>
      </TableCell>
      <TableCell className="whitespace-normal py-4 align-top">
        {secret ? (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <LockKeyhole className="size-3" />
            Secret
          </Badge>
        ) : (
          <p className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
            {value}
          </p>
        )}
      </TableCell>
      <TableCell className="py-3 align-top">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${name}`}
            disabled={disabled}
            data-variable-name={name}
            data-variable-action="edit"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${name}`}
            disabled={disabled}
            data-variable-name={name}
            data-variable-action="remove"
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
