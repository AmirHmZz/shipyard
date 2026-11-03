import type * as z from "zod/mini";

import { FlushCard } from "@/components/FlushCard";
import { TableHeadings } from "@/components/TableHeadings";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { applicationNetworkingResponseSchema } from "../generics";

export type ActiveContainerAddressesProps = {
  endpoints: NonNullable<
    z.output<typeof applicationNetworkingResponseSchema>["endpoints"]
  >;
};
export function ActiveContainerAddresses({
  endpoints,
}: ActiveContainerAddressesProps) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Active container addresses</h2>
        <p className="text-sm text-muted-foreground">
          Network addresses in use by the current deployment.
        </p>
      </div>
      <FlushCard>
        <Table aria-label="Active container addresses">
          <TableHeader>
            <TableHeadings
              columns={[
                { id: "service", label: "Service" },
                { id: "container", label: "Container" },
                { id: "network", label: "Network" },
                { id: "addresses", label: "IP addresses" },
              ]}
              rowProps={{}}
            />
          </TableHeader>
          <TableBody>
            {endpoints.map((endpoint) => (
              <TableRow
                key={JSON.stringify([
                  endpoint.service,
                  endpoint.replica,
                  endpoint.ingress,
                  endpoint.dockerName,
                ])}
              >
                <TableCell className="font-medium">
                  {endpoint.service}
                </TableCell>
                <TableCell>{endpoint.replica}</TableCell>
                <TableCell>
                  {endpoint.ingress ? "HAProxy ingress" : endpoint.dockerName}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {[endpoint.ipv4, endpoint.ipv6].filter(Boolean).join(" / ") ||
                    "Docker-assigned"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FlushCard>
    </section>
  );
}
