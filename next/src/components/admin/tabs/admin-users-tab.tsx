"use client";

import { useTranslations } from "next-intl";
import { Session } from "next-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type User = {
  email: string;
  name: string | null;
  role: string;
  createdAt: Date | null;
};

type AdminStats = {
  total: number;
  owners: number;
  users: number;
  guests: number;
};

type Invite = {
  email: string;
  invitedBy: string;
  createdAt: Date | null;
};

type Props = {
  stats: AdminStats | null;
  users: User[];
  invites: Invite[];
  inviteEmail: string;
  guestEmail: string;
  guestRole: string;
  isPending: boolean;
  session: Session | null;
  onInviteEmailChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onGuestRoleChange: (value: string) => void;
  onInvite: () => void;
  onInviteGuest: () => void;
  onRevokeInvite: (email: string) => void;
  onRemoveUser: (email: string) => void;
  onRoleChange: (email: string, newRole: string) => void;
  onExportUserData: (email: string) => void;
};

export function AdminUsersTab({
  stats,
  users,
  invites,
  inviteEmail,
  guestEmail,
  guestRole,
  isPending,
  session,
  onInviteEmailChange,
  onGuestEmailChange,
  onGuestRoleChange,
  onInvite,
  onInviteGuest,
  onRevokeInvite,
  onRemoveUser,
  onRoleChange,
  onExportUserData,
}: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">{t("stat_total_users")}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.owners}</p>
            <p className="text-sm text-muted-foreground">{t("stat_owners")}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.users}</p>
            <p className="text-sm text-muted-foreground">{t("stat_users")}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.guests}</p>
            <p className="text-sm text-muted-foreground">{t("stat_guests")}</p>
          </Card>
        </div>
      )}

      {/* Users Table */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">{t("registered_users")}</h2>
        {users.length === 0 ? (
          <p className="text-muted-foreground">{t("no_users")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>{tc("date")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-mono text-xs">
                    {user.email}
                  </TableCell>
                  <TableCell>{user.name ?? "—"}</TableCell>
                  <TableCell>
                    {user.email === session?.user?.email ? (
                      <Badge variant="default">{user.role}</Badge>
                    ) : (
                      <Select
                        defaultValue={user.role}
                        onValueChange={(val) =>
                          onRoleChange(user.email, val as string)
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">owner</SelectItem>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="guest">guest</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onExportUserData(user.email)}
                        disabled={isPending}
                      >
                        {t("export_csv")}
                      </Button>
                      {user.email !== session?.user?.email && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => onRemoveUser(user.email)}
                          disabled={isPending}
                        >
                          {tc("remove")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {t("total_users")}: {users.length}
        </p>
      </Card>

      {/* Invite Form */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">{t("invites")}</h2>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={(e) => onInviteEmailChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onInvite()}
          />
          <Button onClick={onInvite} disabled={isPending || !inviteEmail.trim()}>
            {tc("add")}
          </Button>
        </div>
      </Card>

      {/* Guest Management */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("guest_management")}</h2>

        <div className="flex gap-2 flex-wrap">
          <Input
            type="email"
            placeholder="guest@example.com"
            value={guestEmail}
            onChange={(e) => onGuestEmailChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onInviteGuest()}
            className="flex-1 min-w-[200px]"
          />
          <Select value={guestRole} onValueChange={(v) => v && onGuestRoleChange(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guest">guest</SelectItem>
              <SelectItem value="user">user</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={onInviteGuest}
            disabled={isPending || !guestEmail.trim()}
          >
            {t("send_invite")}
          </Button>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">{t("pending_invites")}</h3>
          {invites.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_invites")}</p>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => (
                <div
                  key={inv.email}
                  className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50"
                >
                  <div>
                    <span className="font-medium text-sm">{inv.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("invited_by")}: {inv.invitedBy}
                    </span>
                    {inv.createdAt && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => onRevokeInvite(inv.email)}
                    disabled={isPending}
                  >
                    {t("revoke_invite")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
