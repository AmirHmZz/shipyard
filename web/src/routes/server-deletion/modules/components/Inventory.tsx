import { useState } from "react";

import { TableHeadings } from "@/components/TableHeadings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Item } from "../generics";

function inventoryRows(items: Item[]) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    // A bind mount may be reported once for each container using it.
    const identity = JSON.stringify([item.kind, item.id]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { item, key: `${identity}:${occurrence}` };
  });
}
export type InventoryProps = { title: string; items: Item[] };
export function Inventory({ title, items }: InventoryProps) {
  function handleButtonClick() {
    return setAll((current) => !current);
  }

  const [all, setAll] = useState(false);
  const rows = inventoryRows(items);
  const visibleRows = all ? rows : rows.slice(0, 15);
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="py-5">
        <CardTitle className="text-base" role="heading" aria-level={2}>
          {title}{" "}
          <span className="text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      {items.length ? (
        <>
          <Table>
            <TableHeader>
              <TableHeadings
                columns={[
                  { id: "type", label: <>Type</> },
                  { id: "resource", label: <>Resource</> },
                  { id: "details", label: <>Details</> },
                ]}
                rowProps={{}}
              />
            </TableHeader>
            <TableBody>
              {visibleRows.map(({ item, key }) => (
                <TableRow key={key}>
                  <TableCell className="capitalize">{item.kind}</TableCell>
                  <TableCell className="max-w-xs break-all whitespace-normal font-medium">
                    {item.name}
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">
                    {item.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.length > 15 && (
            <div className="p-4">
              <Button variant="outline" onClick={handleButtonClick}>
                {all ? "Show fewer" : `Show all ${items.length}`}
              </Button>
            </div>
          )}
        </>
      ) : (
        <CardContent className="pb-5 text-sm text-muted-foreground">
          None found.
        </CardContent>
      )}
    </Card>
  );
}
