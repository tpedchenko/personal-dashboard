"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getGuestInvites,
  createGuestInvite,
  deleteGuestInvite,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

type GuestInvite = {
  email: string;
  invitedBy: string;
  createdAt: Date | null;
};

export default function GuestsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [invites, setInvites] = useState<GuestInvite[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    loadInvites();
  }, []);

  function loadInvites() {
    startTransition(async () => {
      const data = await getGuestInvites();
      setInvites(data);
    });
  }

  function handleInvite() {
    if (!email.trim()) return;
    startTransition(async () => {
      await createGuestInvite(email.trim());
      setEmail("");
      loadInvites();
    });
  }

  function handleRevoke(email: string) {
    startTransition(async () => {
      await deleteGuestInvite(email);
      loadInvites();
    });
  }

  return (
    <div className="space-y-4">
      {/* Invite Form */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("invite_guest")}</h2>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>{t("guest_email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              placeholder="guest@example.com"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleInvite}
              disabled={isPending || !email.trim()}
            >
              {t("send_invite")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Active Guests */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("active_guests")}</h2>
        {invites.length === 0 ? (
          <p className="text-muted-foreground">{t("no_invites")}</p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.email}
                className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50"
              >
                <div>
                  <span className="font-medium">{invite.email}</span>
                  {invite.createdAt && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleRevoke(invite.email)}
                  disabled={isPending}
                >
                  {t("revoke")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
