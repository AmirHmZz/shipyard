import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { useResources } from "@/lib/hooks/useResources";
import { text } from "@/lib/resource-fields";
import { useAccount } from "@/lib/session";
export function useDNSPage() {
  const account = useAccount();
  const q = useResources();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const resources = q.data || [];
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const zones = resources.filter((resource) => resource.kind === "zone");
  const zone = zones.find((resource) => resource.id === id);
  const visible = zones.filter((resource) =>
    (text(resource.data, "domain") + " " + resource.name)
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const tab = params.get("tab") === "certificates" ? "certificates" : "records";
  const breadcrumbs = zone
    ? [
        { label: "DNS & domains", to: "/dns" },
        { label: text(zone.data, "domain") },
      ]
    : undefined;
  const title = zone ? text(zone.data, "domain") : "DNS & domains";
  const description = zone
    ? "Manage DNS records, certificates, and team access for this domain."
    : "Manage your Cloudflare and ArvanCloud domains, records, and certificates.";
  function manageAccess() {
    if (zone)
      navigate("/configure/access/" + zone.id + "?return=/dns/" + zone.id);
  }
  function addZone() {
    navigate("/configure/zone/new?return=/dns");
  }
  function setTab(value: string) {
    setParams(value === "records" ? {} : { tab: value });
  }
  return {
    state: { filter },
    derived: {
      account,
      q,
      id,
      resources,
      byId,
      zones,
      zone,
      visible,
      tab,
      breadcrumbs,
      title,
      description,
    },
    handlers: { setFilter, manageAccess, addZone, setTab },
  };
}
