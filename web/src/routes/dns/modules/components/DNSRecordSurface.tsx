import { useParams } from "react-router";

import type { Resource } from "@/lib/api/types";

import {
  ConfigurationGuard,
  ConfigurationPage,
} from "@/components/configuration-surface";

import { DNSRecords } from "./DNSRecords";

export function DNSRecordSurface({ zone }: { zone: Resource }) {
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
