import { Globe2, ShieldCheck } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DNSRecordSurface } from "./DNSRecordSurface";
import { ZoneCertificates } from "./ZoneCertificates";
export type DNSZoneDetailsProps = {
  zone: Resource;
  resources: Resource[];
  tab: string;
  setTab: (value: string) => void;
};
export function DNSZoneDetails({
  zone,
  resources,
  tab,
  setTab,
}: DNSZoneDetailsProps) {
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="records">
          <Globe2 aria-hidden="true" />
          DNS records
        </TabsTrigger>
        <TabsTrigger value="certificates">
          <ShieldCheck aria-hidden="true" />
          Certificates
        </TabsTrigger>
      </TabsList>
      <TabsContent value="records">
        <DNSRecordSurface zone={zone} />
      </TabsContent>
      <TabsContent value="certificates">
        <ZoneCertificates key={zone.id} zone={zone} resources={resources} />
      </TabsContent>
    </Tabs>
  );
}
