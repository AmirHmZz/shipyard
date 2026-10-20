import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Empty } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";

import { RouteCard } from "./RouteCard";

export function ApplicationDomains({
  app,
  routes,
  openEditor,
  setConfirmAction,
}: {
  app: Resource;
  routes: Resource[];
  openEditor: (resource: Resource | "new") => void;
  setConfirmAction: (action: string) => void;
}) {
  return (
    <TabsContent value="domains">
      <div className="mb-5 flex justify-end">
        <Button disabled={!app.canWrite} onClick={() => openEditor("new")}>
          <Plus />
          Add route
        </Button>
      </div>
      <div className="space-y-4">
        {routes.length ? (
          routes.map((route) => (
            <RouteCard
              key={route.id}
              route={{ ...route, canWrite: route.canWrite && app.canWrite }}
              onEdit={() => openEditor(route)}
              onDelete={() => setConfirmAction("delete:" + route.id)}
            />
          ))
        ) : (
          <Empty
            title="Give your application an address"
            description="Add a domain or a TCP listener. Managed zones create DNS records and obtain certificates automatically."
          />
        )}
      </div>
    </TabsContent>
  );
}
