import {
  Bell,
  Download,
  History as HistoryIcon,
  ListTodo,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useSearchParams } from "react-router";

import type { Session } from "@/lib/api/types";

import { PageHeader } from "@/components/Shared";
import { TabScroller } from "@/components/TabScroller";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AlertSettings } from "./AlertSettings";
import { Backup } from "./Backup";
import { DashboardAccess } from "./DashboardAccess";
import { History } from "./History";
import { PasswordSettings } from "./PasswordSettings";
import { Security } from "./Security";
import { SystemUpdates } from "./SystemUpdates";
import { UserSettings } from "./UserSettings";

export type SettingsMainViewProps = { session: Session };
export function SettingsMainView({ session }: SettingsMainViewProps) {
  function handleTabsValueChange(tab: string) {
    return setParams({ tab });
  }

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
        onValueChange={handleTabsValueChange}
      >
        <TabScroller>
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
        </TabScroller>
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
