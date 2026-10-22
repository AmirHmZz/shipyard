import { useParams } from "react-router";

import type { Resource } from "@/lib/api/types";

import {
  ConfigurationGuard,
  ConfigurationPage,
} from "@/components/ConfigurationSurface";

import { DNSRecords } from "./DNSRecords";

export type DNSRecordSurfaceProps = { zone: Resource };
export function DNSRecordSurface({ zone }: DNSRecordSurfaceProps) {
  const { record } = useParams();
  return record ? (
    <ConfigurationPage>
      <ConfigurationGuard key={zone.id + record}>
        <DNSRecords key={record} zone={zone} />
      </ConfigurationGuard>
    </ConfigurationPage>
  ) : (
    <DNSRecords key={zone.id} zone={zone} />
  );
}
