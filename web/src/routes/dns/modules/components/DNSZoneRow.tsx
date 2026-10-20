import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import type { Resource } from "@/lib/api/types";

import { ProviderName } from "@/components/ProviderName";
import { TableRow, TableCell } from "@/components/ui/table";
import { text } from "@/lib/resource-fields";
export type DNSZoneRowProps = {
  zone: Resource;
  connection: Resource | undefined;
};
export function DNSZoneRow({ zone: z, connection }: DNSZoneRowProps) {
  return (
    <TableRow className="relative">
      <TableCell>
        <Link
          className="font-medium hover:text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          to={`/dns/${z.id}`}
        >
          {text(z.data, "domain")}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">{z.name}</p>
      </TableCell>
      <TableCell>
        {connection ? (
          <ProviderName provider={text(connection.data, "provider")} />
        ) : (
          "Managed provider"
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {connection?.name || "Team connection"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(z.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <ArrowRight
          className="ml-auto size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </TableCell>
    </TableRow>
  );
}
