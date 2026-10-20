import { Link } from "react-router";

import type { CertificateSummary, Resource } from "@/lib/api/types";

import { StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not issued";
}

export type ZoneCertificateCardProps = {
  cert: CertificateSummary;
  app: Resource | undefined;
  updatedAt: number;
};
export function ZoneCertificateCard({
  cert,
  app,
  updatedAt,
}: ZoneCertificateCardProps) {
  const expires = cert.expiresAt ? new Date(cert.expiresAt).getTime() : null;
  const expired = expires !== null && expires <= updatedAt;
  const days =
    expires === null ? null : Math.ceil((expires - updatedAt) / 86400000);
  let validityLabel = "Issued";
  if (days !== null) validityLabel = days + " days remaining";
  if (expired) validityLabel = "Expired";
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="break-all text-base">
            {cert.certificateDomain || cert.domain}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {!(expired && cert.status === "ready") && (
              <StateBadge state={cert.status} />
            )}
            {cert.hasCertificate && (
              <Badge variant={expired ? "destructive" : "outline"}>
                {validityLabel}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="break-all">
          {cert.domain}
          {cert.ownerType === "dashboard" && (
            <>
              {" "}
              ·{" "}
              <Link
                className="underline underline-offset-4"
                to="/settings?tab=dashboard"
              >
                Shipyard dashboard
              </Link>
            </>
          )}
          {app && (
            <>
              {" "}
              ·{" "}
              <Link
                className="underline underline-offset-4 hover:text-foreground"
                to={`/applications/${app.id}`}
              >
                {app.name}
              </Link>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4 [&_dt]:mb-1 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:[overflow-wrap:anywhere]">
          <div>
            <dt>Issuer</dt>
            <dd>{cert.issuer || "Not issued"}</dd>
          </div>
          <div>
            <dt>Valid from</dt>
            <dd>{date(cert.validFrom)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{date(cert.expiresAt)}</dd>
          </div>
          <div>
            <dt>Renewal eligible from</dt>
            <dd>{cert.renewalAt ? date(cert.renewalAt) : "After issuance"}</dd>
          </div>
        </dl>
        {!!cert.names.length && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Covered domains
            </p>
            <div className="flex flex-wrap gap-2">
              {cert.names.map((name) => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="break-all whitespace-normal font-normal"
                >
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {cert.hasCertificate && (
          <dl className="grid gap-4 border-t pt-4 text-xs sm:grid-cols-2 [&_dt]:mb-1 [&_dt]:text-muted-foreground [&_dd]:[overflow-wrap:anywhere]">
            <div>
              <dt>Serial number</dt>
              <dd className="font-mono">{cert.serialNumber}</dd>
            </div>
            <div>
              <dt>Certificate authority directory</dt>
              <dd>{cert.authority || "Unavailable"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt>SHA-256 fingerprint</dt>
              <dd className="font-mono">{cert.fingerprint}</dd>
            </div>
          </dl>
        )}
        {cert.error && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">
              {cert.error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
