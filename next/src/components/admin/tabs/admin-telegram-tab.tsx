"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getAdminBotTokenStatus, setAdminBotToken, testBotToken } from "@/actions/telegram";

type TelegramLinkData = {
  telegramId: number;
  userEmail: string;
  telegramUsername: string | null;
};

type Props = {
  telegramLinks: TelegramLinkData[];
  isPending: boolean;
  onUnlink: (telegramId: number) => void;
};

export function AdminTelegramTab({ telegramLinks, isPending, onUnlink }: Props) {
  const t = useTranslations("admin");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ isSet: boolean; maskedToken: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminBotTokenStatus().then(setTokenStatus).catch(() => {});
  }, []);

  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    setSaving(true);
    try {
      await setAdminBotToken(tokenInput.trim());
      setTokenStatus({ isSet: true, maskedToken: tokenInput.slice(0, 8) + "..." });
      setTokenInput("");
      toast.success("Bot token saved");
    } catch {
      toast.error("Failed to save token");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestToken() {
    try {
      const token = tokenInput.trim() || tokenStatus?.maskedToken || "";
      const result = await testBotToken(token);
      if (result.ok) {
        toast.success(`Bot @${result.botName} is working`);
      } else {
        toast.error(result.error || "Token test failed");
      }
    } catch {
      toast.error("Test failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Bot Token</h2>
        <div className="space-y-2">
          {tokenStatus?.isSet && (
            <div className="flex items-center gap-2">
              <Badge variant="default">Active</Badge>
              <span className="text-xs text-muted-foreground font-mono">{tokenStatus.maskedToken}</span>
              <Button variant="outline" size="sm" onClick={handleTestToken}>Test</Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Bot token from @BotFather"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              type="password"
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={handleSaveToken} disabled={saving || !tokenInput.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">{t("telegram_links")}</h2>
        {telegramLinks.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_telegram_links")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Username</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {telegramLinks.map((link) => (
                <TableRow key={link.telegramId}>
                  <TableCell className="font-mono text-xs">{link.userEmail}</TableCell>
                  <TableCell>{link.telegramId}</TableCell>
                  <TableCell>{link.telegramUsername ? `@${link.telegramUsername}` : "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => onUnlink(link.telegramId)}
                      disabled={isPending}
                    >
                      {t("unlink")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
