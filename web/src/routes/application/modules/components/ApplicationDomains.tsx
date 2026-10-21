import type { MouseEvent } from "react";

import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Empty } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";

import { RouteCard } from "./RouteCard";

export type ApplicationDomainsProps = {
  app: Resource;
  routes: Resource[];
  openEditor: (resource: Resource | "new") => void;
  setConfirmAction: (action: string) => void;
};
export function ApplicationDomains({
  app,
  routes,
  openEditor,
  setConfirmAction,
}: ApplicationDomainsProps) {
  function handleRouteAction(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-route-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const route = routes.find((route) => route.id === button.dataset.routeId);
    if (!route) return;
    if (button.dataset.routeAction === "edit") openEditor(route);
    if (button.dataset.routeAction === "delete")
      setConfirmAction("delete:" + route.id);
  }
  function handleButtonClick() {
    return openEditor("new");
  }

  return (
    <TabsContent value="domains">
      <div className="mb-5 flex justify-end">
        <Button disabled={!app.canWrite} onClick={handleButtonClick}>
          <Plus />
          Add route
        </Button>
      </div>
      <div className="flex flex-col gap-4" onClick={handleRouteAction}>
        {routes.length ? (
          routes.map((route) => (
            <RouteCard
              key={route.id}
              route={{ ...route, canWrite: route.canWrite && app.canWrite }}
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
