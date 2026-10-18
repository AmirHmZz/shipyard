import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage, post, setCSRF, type Session } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  ArrowRight,
  GitBranch,
  LockKeyhole,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
export function Auth() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["setup"],
    queryFn: () =>
      api<{ setupRequired: boolean; setupEnabled: boolean }>("/auth/status"),
  });
  const [token] = useState(
    () => new URLSearchParams(location.search).get("token") || "",
  );
  const setup = status.data?.setupRequired && !token;
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    code: "",
    token,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const s = await post<Session>(
        `/auth/${token ? "accept" : setup ? "setup" : "login"}`,
        form,
      );
      setCSRF(s.csrf);
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      client.setQueryData(["session"], s);
      await client.invalidateQueries({ queryKey: ["resources"] });
      if (token) navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1b2d21] p-12 text-[#edf3e7] lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#c1d7a8] text-[#243c28]">
            <Anchor className="size-6" />
          </div>
          <span className="text-xl font-semibold tracking-tight">
            shipyard<span className="text-[#a5ba91]">.</span>
          </span>
        </div>
        <div className="relative z-10 max-w-lg">
          <Badge
            className="mb-7 border-[#839c6c]/30 bg-[#c1d7a8]/10 font-mono text-[10px] tracking-widest text-[#c1d7a8]"
            variant="outline"
          >
            YOUR INFRASTRUCTURE. YOUR CONTROL.
          </Badge>
          <h1 className="text-5xl leading-[1.15] font-medium tracking-tight">
            A clear view.
            <br />A steady release.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-[#adbea8]">
            From your repository to your server. Build, deploy, and roll back
            from one focused workspace.
          </p>
          <div className="mt-10 flex items-center gap-3 text-[#c1d7a8]">
            <GitBranch className="size-5" />
            <div className="h-px w-12 bg-[#6c855a]" />
            <div className="rounded-lg border border-[#617651] p-3">
              <Anchor className="size-6" />
            </div>
            <div className="h-px w-12 bg-[#6c855a]" />
            <Server className="size-5" />
          </div>
        </div>
        <div className="text-xs text-[#8fa585]">
          Built for the way you ship.
        </div>
        <div className="pointer-events-none absolute -right-40 bottom-10 size-[500px] rounded-full border border-[#8ba878]/10" />
        <div className="pointer-events-none absolute -right-24 bottom-26 size-[370px] rounded-full border border-[#8ba878]/10" />
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md border-none bg-transparent shadow-none">
          <CardHeader className="px-0">
            <div className="mb-7 flex items-center gap-2 lg:hidden">
              <Anchor className="size-6 text-primary" />
              <span className="text-xl font-semibold">shipyard.</span>
            </div>
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-card">
              <LockKeyhole className="size-5 text-primary" />
            </div>
            <CardTitle className="text-2xl tracking-tight">
              {token
                ? "Join your team"
                : setup
                  ? "Welcome aboard"
                  : "Welcome back"}
            </CardTitle>
            <CardDescription className="mt-2">
              {token
                ? "Accept your invitation. Existing users should enter their current credentials."
                : setup
                  ? "Create the first administrator account for your Shipyard."
                  : "Sign in to your deployment workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {(setup || token) && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              )}
              {!token && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        email: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={setup ? 12 : 1}
                  autoComplete={setup ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      password: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              {setup ? (
                <div className="space-y-2">
                  <Label htmlFor="bootstrap">Bootstrap token</Label>
                  <Input
                    id="bootstrap"
                    type="password"
                    value={form.token}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        token: e.target.value,
                      }))
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    From SHIPYARD_BOOTSTRAP_TOKEN in your installation
                    environment.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="code">
                    Authenticator / recovery code{" "}
                    <span className="text-muted-foreground">(if enabled)</span>
                  </Label>
                  <Input
                    id="code"
                    autoComplete="one-time-code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        code: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              {(error || status.error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error || errorMessage(status.error)}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                className="h-11 w-full"
                disabled={busy || status.isPending}
              >
                {busy ? <Spinner className="size-4 " /> : null}
                {token
                  ? "Accept invitation"
                  : setup
                    ? "Create workspace"
                    : "Sign in"}
                <ArrowRight className="ml-auto size-4" />
              </Button>
              <p className="flex items-center justify-center gap-2 pt-3 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Private access. Invitations only.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
