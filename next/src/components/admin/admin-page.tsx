"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getUsers, inviteUser, removeUser, changeRole,
  inviteGuest, revokeInvite, getInvites,
  getTelegramLinks, unlinkTelegram,
  getAuditLog, getAdminStats, exportUserDataCsv,
  getMonitoringStats, getErrorLogs, clearErrorLogs,
} from "@/actions/admin";
import { fixMissingCurrencyConversion } from "@/actions/admin-fixes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminUsersTab } from "./tabs/admin-users-tab";
import { AdminTelegramTab } from "./tabs/admin-telegram-tab";
import { AdminDataFixesTab } from "./tabs/admin-data-fixes-tab";
import { AdminMonitoringTab } from "./tabs/admin-monitoring-tab";
import { AdminAuditTab } from "./tabs/admin-audit-tab";

type User = {
  email: string;
  name: string | null;
  role: string;
  createdAt: Date | null;
};

type AuditEntry = {
  id: number;
  userEmail: string;
  action: string;
  details: string | null;
  createdAt: Date | null;
};

type Invite = {
  email: string;
  invitedBy: string;
  createdAt: Date | null;
};

type AdminStats = {
  total: number;
  owners: number;
  users: number;
  guests: number;
};

type TelegramLinkData = {
  telegramId: number;
  userEmail: string;
  telegramUsername: string | null;
};

type MonitoringData = {
  transactions: number;
  dailyLogs: number;
  foodLogs: number;
  workouts: number;
  users: number;
  dataFrom: string | null;
  dataTo: string | null;
};

const TAB_VALUES = ["users", "telegram", "data-fixes", "monitoring", "audit"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isValidTab(value: string | null): value is TabValue {
  return TAB_VALUES.includes(value as TabValue);
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminPage() {
  const t = useTranslations("admin");
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "users";

  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestRole, setGuestRole] = useState("guest");
  const [telegramLinks, setTelegramLinks] = useState<TelegramLinkData[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);
  const [errorLogs, setErrorLogs] = useState<{ id: number; userEmail: string; details: string | null; createdAt: Date | null }[]>([]);

  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;

  useEffect(() => {
    if (role && role !== "owner") {
      router.replace("/");
    }
  }, [role, router]);

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        const [u, a, s, inv, tg, mon, errors] = await Promise.all([
          getUsers(),
          getAuditLog(),
          getAdminStats(),
          getInvites(),
          getTelegramLinks(),
          getMonitoringStats(),
          getErrorLogs(),
        ]);
        setUsers(u);
        setAuditLogs(a);
        setStats(s);
        setInvites(inv);
        setTelegramLinks(tg as TelegramLinkData[]);
        setMonitoring(mon);
        setErrorLogs(errors);
      } catch {
        // redirect handled by guard
      }
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleTabChange(value: unknown) {
    const tab = value as TabValue;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "users") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : ".", { scroll: false });
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    startTransition(async () => {
      await inviteUser(inviteEmail.trim());
      setInviteEmail("");
      loadData();
    });
  }

  function handleRemove(email: string) {
    startTransition(async () => {
      await removeUser(email);
      loadData();
    });
  }

  function handleRoleChange(email: string, newRole: string) {
    startTransition(async () => {
      await changeRole(email, newRole);
      loadData();
    });
  }

  function handleInviteGuest() {
    if (!guestEmail.trim()) return;
    startTransition(async () => {
      await inviteGuest(guestEmail.trim(), guestRole);
      setGuestEmail("");
      toast.success(t("invite_sent"));
      loadData();
    });
  }

  function handleRevokeInvite(email: string) {
    startTransition(async () => {
      await revokeInvite(email);
      toast.success(t("invite_revoked"));
      loadData();
    });
  }

  function handleExportUserData(email: string) {
    startTransition(async () => {
      try {
        const csv = await exportUserDataCsv(email);
        const today = new Date().toISOString().slice(0, 10);
        downloadCsv(csv, `user_data_${email}_${today}.csv`);
      } catch {
        toast.error("Export failed");
      }
    });
  }

  function handleUnlinkTelegram(telegramId: number) {
    startTransition(async () => {
      await unlinkTelegram(telegramId);
      loadData();
    });
  }

  function handleClearErrorLogs() {
    startTransition(async () => {
      await clearErrorLogs();
      setErrorLogs([]);
      toast.success("Errors cleared");
    });
  }

  function handleFixCurrencyConversion() {
    startTransition(async () => {
      try {
        const result = await fixMissingCurrencyConversion();
        toast.success(`Found ${result.found}, fixed ${result.fixed}${result.errors.length > 0 ? `, errors: ${result.errors.length}` : ""}`);
        loadData();
      } catch (err) {
        toast.error(`Fix failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  if (role !== "owner") {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">{t("title")}</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">{t("users")}</TabsTrigger>
          <TabsTrigger value="telegram">{t("telegram")}</TabsTrigger>
          <TabsTrigger value="data-fixes">{t("data_fixes")}</TabsTrigger>
          <TabsTrigger value="monitoring">{t("monitoring")}</TabsTrigger>
          <TabsTrigger value="audit">{t("audit_log")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminUsersTab
            stats={stats}
            users={users}
            invites={invites}
            inviteEmail={inviteEmail}
            guestEmail={guestEmail}
            guestRole={guestRole}
            isPending={isPending}
            session={session}
            onInviteEmailChange={setInviteEmail}
            onGuestEmailChange={setGuestEmail}
            onGuestRoleChange={setGuestRole}
            onInvite={handleInvite}
            onInviteGuest={handleInviteGuest}
            onRevokeInvite={handleRevokeInvite}
            onRemoveUser={handleRemove}
            onRoleChange={handleRoleChange}
            onExportUserData={handleExportUserData}
          />
        </TabsContent>

        <TabsContent value="telegram">
          <AdminTelegramTab
            telegramLinks={telegramLinks}
            isPending={isPending}
            onUnlink={handleUnlinkTelegram}
          />
        </TabsContent>

        <TabsContent value="data-fixes">
          <AdminDataFixesTab
            isPending={isPending}
            onFixCurrencyConversion={handleFixCurrencyConversion}
          />
        </TabsContent>

        <TabsContent value="monitoring">
          <AdminMonitoringTab
            monitoring={monitoring}
            errorLogs={errorLogs}
            isPending={isPending}
            onClearErrorLogs={handleClearErrorLogs}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AdminAuditTab auditLogs={auditLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
