import { Trash2 } from "lucide-react";

import type { DNSRecord } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
export type DNSRecordRowProps = { record: DNSRecord; canWrite: boolean };
export function DNSRecordRow({ record, canWrite }: DNSRecordRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {record.type}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">{record.name}</TableCell>
      <TableCell className="max-w-64 truncate font-mono text-xs">
        {record.content || JSON.stringify(record.data)}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {record.ttl === 1 ? "Auto" : record.ttl}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {record.proxied ? "Proxied" : "DNS only"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          disabled={!canWrite}
          variant="ghost"
          size="sm"
          data-record-id={record.id}
          data-action="edit"
        >
          Edit
        </Button>
        <Button
          disabled={!canWrite}
          variant="ghost"
          size="icon"
          aria-label="Delete DNS record"
          data-record-id={record.id}
          data-action="delete"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
