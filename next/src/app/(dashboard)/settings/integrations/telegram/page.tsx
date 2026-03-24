"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getUserPreference, setUserPreference } from "@/actions/settings";
import { saveTelegramChatId, getTelegramChatId, removeTelegramChatId } from "@/actions/telegram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function TelegramIntegrationPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [linkedInfo, setLinkedInfo] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const [chatIdVal, en] = await Promise.all([
        getTelegramChatId(),
        getUserPreference("telegram_enabled"),
      ]);
      if (chatIdVal) {
        setChatId(chatIdVal);
        setIsLinked(true);
        setLinkedInfo(chatIdVal);
      }
      if (en === "true") setEnabled(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    const trimmed = chatId.trim();
    if (!trimmed) return;
    // Validate that it's a numeric ID
    if (!/^-?\d+$/.test(trimmed)) return;
    startTransition(async () => {
      await saveTelegramChatId(trimmed);
      await setUserPreference("telegram_enabled", "true");
      setSaved(true);
      setIsLinked(true);
      setLinkedInfo(trimmed);
      setEnabled(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await removeTelegramChatId();
      await setUserPreference("telegram_enabled", "false");
      setChatId("");
      setIsLinked(false);
      setLinkedInfo(null);
      setEnabled(false);
    });
  }

  function handleToggle(val: boolean) {
    setEnabled(val);
    startTransition(async () => {
      await setUserPreference("telegram_enabled", val ? "true" : "false");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("integration_telegram")}</h2>
          <Badge variant={isLinked && enabled ? "default" : "secondary"}>
            {isLinked && enabled ? t("integration_status_connected") : t("integration_status_not_configured")}
          </Badge>
        </div>

        {isLinked && (
          <div className="flex items-center justify-between">
            <Label>{enabled ? t("telegram_enable") : t("telegram_disable")}</Label>
            <Switch checked={enabled} onCheckedChange={handleToggle} />
          </div>
        )}

        <div>
          <Label>{t("telegram_chat_id")}</Label>
          <Input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder={t("telegram_chat_id_placeholder")}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t("telegram_chat_id_hint")}
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending || !chatId.trim() || !/^-?\d+$/.test(chatId.trim())}>
            {tc("save")}
          </Button>
          {isLinked && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {t("telegram_disconnect")}
            </Button>
          )}
        </div>

        {saved && (
          <p className="text-sm text-green-600">{tc("success")}</p>
        )}

        {isLinked && linkedInfo && (
          <p className="text-sm text-muted-foreground">
            {t("telegram_linked_as", { chatId: linkedInfo })}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="font-medium">{t("how_to_setup")}</h3>
          <span className="text-muted-foreground">{showInstructions ? "▲" : "▼"}</span>
        </button>
        {showInstructions && (
          <div className="text-sm text-muted-foreground whitespace-pre-line mt-3">
            {t("telegram_user_setup_instructions")}
          </div>
        )}
      </Card>
    </div>
  );
}
