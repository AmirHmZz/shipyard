import { DashboardAccess } from "@/components/dashboard-access";
import { ResourceEditor } from "@/components/resource-editor";
import {
  Confirm,
  CopyButton,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  StateBadge,
} from "@/components/shared";
import { SystemUpdates } from "@/components/system-updates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  errorMessage,
  post,
  setCSRF,
  useAccount,
  useResources,
  type Session,
} from "@/lib/api";
import type { components } from "@/lib/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Download,
  History as HistoryIcon,
  KeyRound,
  ListTodo,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
type AlertPolicy = components["schemas"]["AlertPolicy"];

function AlertSettings() {
  const query = useQuery({
    queryKey: ["alert-policy"],
    queryFn: () => api<AlertPolicy>("/settings/alerts"),
  });
  const [draft, setDraft] = useState<AlertPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const value = draft || query.data!;
  const fields = [
    { key: "cpu", label: "CPU threshold (%)", max: 100 },
    { key: "memory", label: "Memory threshold (%)", max: 100 },
    { key: "disk", label: "Disk threshold (%)", max: 100 },
    {
      key: "sustainedSeconds",
      label: "Resource threshold duration (seconds)",
      max: 86400,
    },
    { key: "offlineSeconds", label: "Offline duration (seconds)", max: 86400 },
  ] as const;
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle>Alert policy</CardTitle>
        <CardDescription>
          Notify configured webhook integrations when a condition persists. A
          recovery event follows when it clears. Metrics are sampled every 30
          seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/settings/alerts", {
                method: "PUT",
                body: JSON.stringify(value),
              });
              await query.refetch();
              setDraft(null);
              toast.success("Alert policy saved");
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {fields.map((f) => (
            <div className="space-y-2" key={f.key}>
              <Label htmlFor={`alert-${f.key}`}>{f.label}</Label>
              <Input
                id={`alert-${f.key}`}
                type="number"
                min={f.max === 100 ? 1 : 30}
                max={f.max}
                value={value[f.key]}
                onChange={(e) =>
                  setDraft({ ...value, [f.key]: Number(e.target.value) })
                }
                required
              />
            </div>
          ))}
          <Button disabled={busy}>
            {busy && <Spinner className="size-4 " />}Save alert policy
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UserSettings({ session }: { session: Session }) {
  type User = {
    id: string;
    name: string;
    email: string;
    admin: boolean;
    disabled: boolean;
    totp: boolean;
  };
  const q = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
  });
  const [change, setChange] = useState<User | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <Card className="overflow-hidden pb-0 shadow-none">
        <CardHeader>
          <CardTitle>Platform users</CardTitle>
          <CardDescription>
            Invite new users from Teams & access. Changing access ends the
            user's sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Authenticator</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>{u.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StateBadge
                      state={
                        u.disabled
                          ? "disabled"
                          : u.admin
                            ? "administrator"
                            : "member"
                      }
                    />
                  </TableCell>
                  <TableCell>{u.totp ? "Enabled" : "Off"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={u.id === session.user.id}
                      onClick={() => setChange({ ...u, admin: !u.admin })}
                    >
                      {u.admin ? "Remove admin" : "Make admin"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={u.id === session.user.id}
                      onClick={() => setChange({ ...u, disabled: !u.disabled })}
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Confirm
        open={!!change}
        onOpenChange={(v) => !v && setChange(null)}
        title="Change user access?"
        description={`${change?.name} will be ${change?.disabled ? "disabled" : change?.admin ? "a platform administrator" : "a regular user"}. Existing sessions will end.`}
        onConfirm={async () => {
          await api("/users/" + change?.id, {
            method: "PUT",
            body: JSON.stringify({
              admin: change?.admin,
              disabled: change?.disabled,
            }),
          });
          await q.refetch();
          toast.success("User access updated");
        }}
      />
    </>
  );
}

function PasswordSettings() {
  const client = useQueryClient();
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Card className="mt-5 max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Other sessions will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const s = await post<Session>("/auth/password", {
                current,
                password,
                code,
              });
              setCSRF(s.csrf);
              client.setQueryData(["session"], s);
              setCurrent("");
              setPassword("");
              setCode("");
              toast.success("Password changed");
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              autoComplete="current-password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-new">New password</Label>
            <Input
              id="password-new"
              autoComplete="new-password"
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-code">
              Authenticator / recovery code (if enabled)
            </Label>
            <Input
              id="password-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button disabled={busy}>Change password</Button>
        </form>
      </CardContent>
    </Card>
  );
}
export function Teams() {
  const account = useAccount();
  const q = useResources();
  const [teamId, setTeamId] = useState("");
  const [editor, setEditor] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [project, setProject] = useState("");
  const [invitation, setInvitation] = useState("");
  const resources = q.data || [];
  const teams = resources.filter((r) => r.kind === "team");
  const team = teams.find((r) => r.id === (teamId || teams[0]?.id));
  const members = useQuery({
    queryKey: ["members", team?.id],
    queryFn: () =>
      api<{ id: string; email: string; name: string; role: string }[]>(
        `/teams/${team?.id}/members`,
      ),
    enabled: !!team,
  });
  const [assign, setAssign] = useState("");
  const [remove, setRemove] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Teams & access"
        description="Give trusted people the access they need, with project-level roles."
      >
        <Button disabled={!account?.admin} onClick={() => setEditor(true)}>
          <Plus />
          New team
        </Button>
      </PageHeader>
      {team ? (
        <>
          <Select value={team.id} onValueChange={setTeamId}>
            <SelectTrigger className="mb-6 w-64 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="gap-4 overflow-hidden pb-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Members</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {members.error ? (
                  <ErrorState error={members.error} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.data?.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="font-medium">{member.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {member.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StateBadge state={member.role} />
                          </TableCell>
                          <TableCell>
                            <Button
                              disabled={!team.canWrite}
                              variant="ghost"
                              size="sm"
                              onClick={() => setAssign(member.id)}
                            >
                              Project access
                            </Button>
                            <Button
                              disabled={
                                !team.canWrite || member.id === account?.id
                              }
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemove(member.id)}
                            >
                              Remove member
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Invite a teammate</CardTitle>
                <CardDescription>
                  Create a single-use link, valid for 48 hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const v = await post<{ url: string }>(
                        `/teams/${team.id}/invitations`,
                        { email, role, projectId: project },
                      );
                      setInvitation(v.url);
                      toast.success("Invitation created");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access scope</Label>
                    <Select
                      value={project || "team"}
                      onValueChange={(v) => {
                        setProject(v === "team" ? "" : v);
                        setRole(v === "team" ? "member" : "viewer");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team">Team membership</SelectItem>
                        {resources
                          .filter(
                            (r) => r.kind === "project" && r.teamId === team.id,
                          )
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(project
                          ? ["owner", "operator", "viewer"]
                          : ["member", "owner"]
                        ).map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={!team.canWrite} type="submit">
                    <Plus />
                    Create invitation
                  </Button>
                  {invitation && (
                    <div className="space-y-3 rounded-lg border bg-muted/50 p-3">
                      <p className="break-all font-mono text-[10px]">
                        {invitation}
                      </p>
                      <CopyButton
                        value={invitation}
                        label="Copy invitation link"
                      />
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
          <Dialog open={!!assign} onOpenChange={(v) => !v && setAssign("")}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Project access</DialogTitle>
                <DialogDescription>
                  Owners and operators can configure and deploy applications.
                  Viewers have read access.
                </DialogDescription>
              </DialogHeader>
              {resources
                .filter((r) => r.kind === "project" && r.teamId === team.id)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <Label>{p.name}</Label>
                    <Select
                      onValueChange={async (value) => {
                        try {
                          await post(`/projects/${p.id}/members`, {
                            userId: assign,
                            role: value,
                          });
                          toast.success("Project access updated");
                        } catch (e) {
                          toast.error(errorMessage(e));
                        }
                      }}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Assign role" />
                      </SelectTrigger>
                      <SelectContent>
                        {["owner", "operator", "viewer", "remove"].map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Empty
          title="Build a team around your project"
          description="Team owners manage members and access to shared infrastructure."
          icon={<Users />}
          action={
            <Button disabled={!account?.admin} onClick={() => setEditor(true)}>
              <Plus />
              Create team
            </Button>
          }
        />
      )}
      <ResourceEditor
        open={editor}
        onOpenChange={setEditor}
        kind="team"
        resources={resources}
      />
      <Confirm
        open={!!remove}
        onOpenChange={(v) => !v && setRemove("")}
        title="Remove team member?"
        description="Their membership and all project grants in this team will be removed."
        destructive
        onConfirm={async () => {
          await api(`/teams/${team?.id}/members/${remove}`, {
            method: "DELETE",
            body: "{}",
          });
          await members.refetch();
          toast.success("Member removed");
        }}
      />
    </>
  );
}
function Security({ session }: { session: Session }) {
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(
    null,
  );
  const [recovery, setRecovery] = useState<string[]>([]);
  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-primary/5">
          <KeyRound className="size-5 text-primary" />
        </div>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
        <CardDescription>
          Add an authenticator to your local account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StateBadge state={session.user.totp ? "enabled" : "not configured"} />
        <div className="space-y-2">
          <Label>Current password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {setup ? (
          <>
            <Alert>
              <AlertDescription>
                <p className="mb-2">
                  Add this secret to your authenticator, then enter its
                  six-digit code.
                </p>
                <code className="break-all text-xs">{setup.secret}</code>
              </AlertDescription>
            </Alert>
            <CopyButton value={setup.url} label="Copy authenticator URL" />
            <div className="space-y-2">
              <Label>Authenticator code</Label>
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button
              onClick={async () => {
                try {
                  const v = await post<{ recoveryCodes: string[] }>(
                    "/auth/totp/confirm",
                    { code },
                  );
                  setRecovery(v.recoveryCodes);
                  setSetup(null);
                  setPassword("");
                  await client.invalidateQueries({ queryKey: ["session"] });
                  toast.success("Authenticator enabled");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Confirm authenticator
            </Button>
          </>
        ) : session.user.totp ? (
          <>
            <div className="space-y-2">
              <Label>Authenticator / recovery code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await post("/auth/totp/disable", { password, code });
                  await client.invalidateQueries({ queryKey: ["session"] });
                  setPassword("");
                  setCode("");
                  toast.success("Authenticator disabled");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Disable authenticator
            </Button>
          </>
        ) : (
          <Button
            onClick={async () => {
              try {
                setSetup(await post("/auth/totp/start", { password }));
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <ShieldCheck />
            Set up authenticator
          </Button>
        )}
        {!!recovery.length && (
          <Alert>
            <AlertDescription>
              <p className="mb-3">
                Save these recovery codes now. Each can be used once.
              </p>
              <pre className="text-xs">{recovery.join("\n")}</pre>
              <div className="mt-3">
                <CopyButton
                  value={recovery.join("\n")}
                  label="Copy recovery codes"
                />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
function Backup({ session }: { session: Session }) {
  const client = useQueryClient();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-2xl space-y-5">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Maintenance mode</CardTitle>
          <CardDescription>
            Pause new operations before creating a consistent backup. Running
            applications keep serving traffic.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label>Maintenance mode</Label>
          <Switch
            checked={session.maintenance || false}
            onCheckedChange={async (enabled) => {
              try {
                await post("/settings/maintenance", { enabled });
                await client.invalidateQueries({ queryKey: ["session"] });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          />
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Export Shipyard</CardTitle>
          <CardDescription>
            Includes the database, encrypted credentials, certificate keys, and
            control-plane files. Remote application volumes and images are
            excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const blob = await post<Blob>("/backup", { passphrase });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `shipyard-${new Date().toISOString().slice(0, 10)}.sybackup`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                setPassphrase("");
                toast.success("Encrypted backup downloaded");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Label htmlFor="passphrase">Backup passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              minLength={12}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
            />
            <Button disabled={busy || !session.maintenance}>
              {busy ? <Spinner className="size-4 " /> : <Download />}Export
              encrypted backup
            </Button>
          </form>
        </CardContent>
      </Card>
      <Alert>
        <AlertDescription>
          Restore using the <code>shipyard restore</code> command against an
          empty PostgreSQL database while the control plane is stopped. See the
          recovery guide in the repository.
        </AlertDescription>
      </Alert>
    </div>
  );
}
function History({ type }: { type: "audit" | "jobs" }) {
  const q = useQuery({
    queryKey: [type],
    queryFn: () => api<Record<string, string | number>[]>(`/${type}`),
    refetchInterval: 10000,
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            {(type === "jobs"
              ? ["Job", "Resource", "State", "Attempts", "Error"]
              : ["Action", "Resource", "User", "Time"]
            ).map((v) => (
              <TableHead key={v}>{v}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data?.map((row) => (
            <TableRow key={row.id}>
              {(type === "jobs"
                ? ["kind", "resourceId", "state", "attempts", "error"]
                : ["action", "resourceId", "userId", "at"]
              ).map((key) => (
                <TableCell
                  key={key}
                  className="max-w-80 truncate font-mono text-xs"
                >
                  {key === "state" ? (
                    <StateBadge state={String(row[key])} />
                  ) : (
                    String(row[key] || "—")
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!q.data?.length && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          No entries yet.
        </p>
      )}
    </Card>
  );
}
export function Settings({ session }: { session: Session }) {
  const [params, setParams] = useSearchParams();
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Your account, operational history, and recovery tools."
      />
      <Tabs
        value={params.get("tab") || "security"}
        onValueChange={(tab) => setParams({ tab })}
      >
        <div className="overflow-x-auto overflow-y-hidden p-1 -m-1">
          <TabsList>
            <TabsTrigger value="security">
              <ShieldCheck aria-hidden="true" />
              Account security
            </TabsTrigger>
            {session.user.admin && (
              <>
                <TabsTrigger value="updates">
                  <RefreshCw aria-hidden="true" />
                  System updates
                </TabsTrigger>
                <TabsTrigger value="dashboard">
                  <LockKeyhole aria-hidden="true" />
                  Dashboard access
                </TabsTrigger>
                <TabsTrigger value="backup">
                  <Download aria-hidden="true" />
                  Backup & recovery
                </TabsTrigger>
                <TabsTrigger value="jobs">
                  <ListTodo aria-hidden="true" />
                  Jobs
                </TabsTrigger>
                <TabsTrigger value="alerts">
                  <Bell aria-hidden="true" />
                  Alerts
                </TabsTrigger>
                <TabsTrigger value="users">
                  <Users aria-hidden="true" />
                  Users
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="audit">
              <HistoryIcon aria-hidden="true" />
              Audit log
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="security">
          <Security session={session} />
          <PasswordSettings />
        </TabsContent>
        {session.user.admin && (
          <>
            <TabsContent value="updates">
              <SystemUpdates />
            </TabsContent>
            <TabsContent value="dashboard">
              <DashboardAccess />
            </TabsContent>
            <TabsContent value="backup">
              <Backup session={session} />
            </TabsContent>
            <TabsContent value="jobs">
              <History type="jobs" />
            </TabsContent>
            <TabsContent value="alerts">
              <AlertSettings />
            </TabsContent>
            <TabsContent value="users">
              <UserSettings session={session} />
            </TabsContent>
          </>
        )}
        <TabsContent value="audit">
          <History type="audit" />
        </TabsContent>
      </Tabs>
    </>
  );
}
