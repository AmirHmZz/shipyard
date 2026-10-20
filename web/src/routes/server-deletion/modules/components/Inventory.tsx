import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Item } from "../generics";

export function Inventory({ title, items }: { title: string; items: Item[] }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const occurrences = new Map<string, number>();
    return items.map((item) => {
      // A bind mount may be reported once for each container using it.
      const identity = JSON.stringify([item.kind, item.id]);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      return { item, key: `${identity}:${occurrence}` };
    });
  }, [items]);
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
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(all ? rows : rows.slice(0, 15)).map(({ item, key }) => (
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
              <Button
                variant="outline"
                onClick={() => setAll((current) => !current)}
              >
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
