import { Fingerprint, RefreshCw } from "lucide-react";

import { useResourceForm } from "@/components/resource-forms/controller";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { ResourceFieldProps } from "../types";

export function ResourceFieldActions({
  kind,
  f,
}: Pick<ResourceFieldProps, "kind" | "f" | "repos" | "branches">) {
  const {
    state: { data, probe },
    actions: { setSecret, probeFingerprint, change },
  } = useResourceForm();
  return (
    <>
      {kind === "server" && f.key === "fingerprint" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={probe || !data.host}
          onClick={() => void probeFingerprint()}
        >
          {probe ? <Spinner className="size-4 " /> : <Fingerprint />}
          Probe fingerprint
        </Button>
      )}
      {f.key === "webhook_secret" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            change();
            setSecret(
              "webhook_secret",
              Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
                n.toString(16).padStart(2, "0"),
              ).join(""),
            );
          }}
        >
          <RefreshCw />
          Generate signing secret
        </Button>
      )}
    </>
  );
}
