import { ShieldCheck } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Empty, ErrorState, Loading } from "@/components/Shared";
import { indexResources } from "@/lib/resource-index";

import { useZoneCertificates } from "../hooks";
import { ZoneCertificateCard } from "./ZoneCertificateCard";
export type ZoneCertificatesProps = {
  zone: Resource;
  resources: Resource[];
};
export function ZoneCertificates({ zone, resources }: ZoneCertificatesProps) {
  const { byId } = indexResources(resources);
  const q = useZoneCertificates(zone);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data?.length)
    return (
      <Empty
        title="No managed certificates yet"
        description="Certificates appear here when HTTPS is configured for applications using this DNS zone."
        icon={<ShieldCheck />}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Managed certificates renew automatically during their final 30 days of
        validity.
      </p>
      {q.data.map((cert) => (
        <ZoneCertificateCard
          key={cert.routeId}
          cert={cert}
          app={byId.get(cert.applicationId || "")}
          updatedAt={q.dataUpdatedAt}
        />
      ))}
    </div>
  );
}
