import { Plus } from "lucide-react";

import { Confirm, ErrorState, Loading, PageHeader } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/translate-error";

import { useNetworksPage } from "../hooks";
import { NetworkServerFilter } from "./NetworkServerFilter";
import { NetworkTable } from "./NetworkTable";
export function NetworksMainView() {
  const controller = useNetworksPage();
  const { remove, filter } = controller.state;
  const {
    q,
    account,
    resources,
    inventory,
    removeMutation,
    removalTitle,
    showInventoryError,
  } = controller.derived;
  const {
    setFilter,
    confirmRemoval,
    handleRemovalOpenChange,
    addNetwork,
    refreshNetworks,
  } = controller.handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        title="Docker networks"
        description="Manage bridge networks on your deployment servers. Application changes apply on the next deployment."
      >
        <Button disabled={!account?.admin} onClick={addNetwork}>
          <Plus />
          Add network
        </Button>
      </PageHeader>
      <NetworkServerFilter
        filter={filter}
        setFilter={setFilter}
        resources={resources}
        account={account}
        inventory={inventory}
      />
      {inventory.isFetching && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Loading server networks…
        </p>
      )}
      {showInventoryError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>
            Could not load server networks: {describeError(inventory.error)}
            <Button variant="outline" size="sm" onClick={refreshNetworks}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <NetworkTable controller={controller} />
      <Confirm
        open={!!remove}
        onOpenChange={handleRemovalOpenChange}
        title={removalTitle}
        description="The network must not be referenced by applications or have attached containers. External Docker networks are preserved."
        destructive
        pending={removeMutation.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
