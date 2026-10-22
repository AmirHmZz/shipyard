import { Plus, Users } from "lucide-react";
import { Link } from "react-router";

import {
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
} from "@/components/Shared";
import { Button } from "@/components/ui/button";

import { useDNSPage } from "../hooks";
import { DNSZoneDetails } from "./DNSZoneDetails";
import { DNSZoneTable } from "./DNSZoneTable";
export function DNSMainView() {
  const { state, derived, handlers } = useDNSPage();
  const { filter } = state;
  const {
    q,
    id,
    zone,
    account,
    resources,
    tab,
    breadcrumbs,
    title,
    description,
    zones,
    visible,
    byId,
  } = derived;
  const { setFilter, manageAccess, addZone, setTab } = handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (id && !zone)
    return (
      <Empty
        title="Domain not found"
        description="This domain may not exist or you may not have access."
        action={
          <Button asChild variant="outline">
            <Link to="/dns">Back to domains</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        breadcrumbs={breadcrumbs}
        title={title}
        description={description}
      >
        {zone ? (
          <Button
            disabled={!zone.canWrite}
            variant="outline"
            onClick={manageAccess}
          >
            <Users /> Team access
          </Button>
        ) : (
          <Button
            disabled={!account?.admin}
            variant="outline"
            onClick={addZone}
          >
            <Plus />
            Add zone
          </Button>
        )}
      </PageHeader>
      {!zone && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Filter
            value={filter}
            onChange={setFilter}
            placeholder="Filter domains…"
          />
        </div>
      )}
      {zone ? (
        <DNSZoneDetails
          zone={zone}
          resources={resources}
          tab={tab}
          setTab={setTab}
        />
      ) : (
        <DNSZoneTable zones={zones} visible={visible} byId={byId} />
      )}
    </>
  );
}
