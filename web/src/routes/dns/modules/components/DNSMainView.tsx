import { ArrowRight, Globe2, Plus, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { Grants } from "@/components/grants";
import { ProviderName } from "@/components/provider-name";
import {
  Empty,
  ErrorState,
  Filter,
  Loading,
  PageHeader,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResources } from "@/lib/hooks/useResources";
import { text } from "@/lib/resource-fields";
import { useAccount } from "@/lib/session";

import { DNSRecordSurface } from "./DNSRecordSurface";
import { ZoneCertificates } from "./ZoneCertificates";

export function DNSMainView() {
  const account = useAccount();
  const q = useResources();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [grant, setGrant] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const resources = q.data || [];
  const byId = new Map(resources.map((r) => [r.id, r]));
  const zones = resources.filter((r) => r.kind === "zone");
  const zone = zones.find((z) => z.id === id);
  const visible = zones.filter((z) =>
    `${text(z.data, "domain")} ${z.name}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
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
        breadcrumbs={
          zone
            ? [
                { label: "DNS & domains", to: "/dns" },
                { label: text(zone.data, "domain") },
              ]
            : undefined
        }
        title={zone ? text(zone.data, "domain") : "DNS & domains"}
        description={
          zone
            ? "Manage DNS records, certificates, and team access for this domain."
            : "Manage your Cloudflare and ArvanCloud domains, records, and certificates."
        }
      >
        {zone ? (
          <Button
            disabled={!zone.canWrite}
            variant="outline"
            onClick={() =>
              navigate(`/configure/access/${zone!.id}?return=/dns/${zone!.id}`)
            }
          >
            <Users /> Team access
          </Button>
        ) : (
          <Button
            disabled={!account?.admin}
            variant="outline"
            onClick={() => navigate("/configure/zone/new?return=/dns")}
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
        <Tabs
          value={
            params.get("tab") === "certificates" ? "certificates" : "records"
          }
          onValueChange={(value) =>
            setParams(value === "records" ? {} : { tab: value })
          }
        >
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
      ) : zones.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>
                  <span className="sr-only">Manage</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length ? (
                visible.map((z) => {
                  const connection = byId.get(z.parentId || "");
                  return (
                    <TableRow key={z.id} className="relative">
                      <TableCell>
                        <Link
                          className="font-medium hover:text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                          to={`/dns/${z.id}`}
                        >
                          {text(z.data, "domain")}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {z.name}
                        </p>
                      </TableCell>
                      <TableCell>
                        {connection ? (
                          <ProviderName
                            provider={text(connection.data, "provider")}
                          />
                        ) : (
                          "Managed provider"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {connection?.name || "Team connection"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(z.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <ArrowRight
                          className="ml-auto size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No domains match your filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty
          title="Connect a DNS zone"
          description="Add a provider in Integrations, import an existing zone, and grant it to your team."
          icon={<Globe2 />}
        />
      )}
      <Dialog open={grant} onOpenChange={setGrant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zone access</DialogTitle>
            <DialogDescription>
              Team owners can edit records in granted zones.
            </DialogDescription>
          </DialogHeader>
          {zone && <Grants resource={zone} resources={resources} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
