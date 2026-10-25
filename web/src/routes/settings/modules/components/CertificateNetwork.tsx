import type { FormEvent } from "react";

import { useState } from "react";
import { Link } from "react-router";

import { SelectControl } from "@/components/SelectControl";
import { ErrorState, Loading } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useResources } from "@/lib/hooks/useResources";

import { useCertificateNetwork, useSaveCertificateNetwork } from "../hooks";
export function CertificateNetwork() {
  const query = useCertificateNetwork();
  const save = useSaveCertificateNetwork();
  const resources = useResources();
  const [draft, setDraft] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.data || save.isPending) return;
    save.mutate((draft ?? query.data.proxyId) || "", {
      onSuccess: () => setDraft(null),
    });
  }
  function select(value: string) {
    setDraft(value === "__direct__" ? "" : value);
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle>Certificate connection</CardTitle>
        <CardDescription>
          This connection is used for certificate authority registration,
          issuance and renewal, for both Shipyard and application certificates.
          DNS challenge API calls use the DNS provider’s own connection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <SelectControl
            value={(draft ?? query.data?.proxyId) || "__direct__"}
            onValueChange={select}
            options={[
              { value: "__direct__", label: "Direct connection" },
              ...(resources.data || [])
                .filter((r) => r.kind === "proxy")
                .map((r) => ({ value: r.id, label: r.name })),
            ]}
            triggerProps={{ "aria-label": "Certificate proxy" }}
          />
          <p className="text-sm text-muted-foreground">
            Manage SOCKS5 and SOCKS5H connections in{" "}
            <Link className="underline" to="/integrations">
              Integrations
            </Link>
            . Changes apply to the next operation without restarting.
          </p>
          <Button className="self-start" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save connection"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
