import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

import type { State } from "../generics";

export type DashboardHostnameFormProps = {
  state: State;
  draft: string | null;
  setDraft: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  accept: boolean;
  setAccept: (value: boolean) => void;
  busy: boolean;
  save: () => void;
};

export function DashboardHostnameForm({
  state,
  draft,
  setDraft,
  email,
  setEmail,
  accept,
  setAccept,
  busy,
  save,
}: DashboardHostnameFormProps) {
  function handleformSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!state.acmeConfigured && !accept) return;
    void save();
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setDraft(e.target.value);
  }
  function handleInputChange2(e: React.ChangeEvent<HTMLInputElement>) {
    return setEmail(e.target.value);
  }

  return (
    <form className="space-y-4" onSubmit={handleformSubmit}>
      <div className="space-y-2">
        <Label htmlFor="dashboard-domain">Dashboard hostname</Label>
        <Input
          id="dashboard-domain"
          required
          placeholder="shipyard.example.com"
          value={draft ?? state.domain}
          onChange={handleInputChange}
        />
        <p className="text-sm text-muted-foreground">
          DNS is managed manually for this hostname. Certificate issuance and
          renewal use HTTP validation on public port 80.
        </p>
      </div>
      {!state.acmeConfigured && (
        <div className="space-y-3">
          <Label htmlFor="dashboard-email">
            Certificate contact email (optional)
          </Label>
          <Input
            id="dashboard-email"
            type="email"
            value={email}
            onChange={handleInputChange2}
          />
          <div className="flex items-start gap-3">
            <Switch
              id="dashboard-consent"
              checked={accept}
              onCheckedChange={setAccept}
            />
            <Label htmlFor="dashboard-consent">
              I accept the Let's Encrypt terms of service
            </Label>
            <a
              href="https://letsencrypt.org/repository/"
              className="text-sm underline"
              target="_blank"
              rel="noreferrer"
            >
              Read terms
            </a>
          </div>
        </div>
      )}
      <Button
        disabled={
          busy || !(draft ?? state.domain) || (!state.acmeConfigured && !accept)
        }
      >
        {busy && <Spinner className="size-4 " />}Save hostname
      </Button>
    </form>
  );
}
