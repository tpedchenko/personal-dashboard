"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { enterDemoMode } from "@/actions/demo";
import { getPasskeyAuthenticationOptions, verifyPasskeyAuthentication } from "@/actions/passkey";
import { startAuthentication } from "@simplewebauthn/browser";
import { LanguageToggle } from "@/components/shared/language-toggle";

const FEATURES = [
  { icon: "💰", nameKey: "mod_finance", descKey: "tooltip_finance" },
  { icon: "📅", nameKey: "mod_my_day", descKey: "tooltip_my_day" },
  { icon: "🏋️", nameKey: "mod_gym", descKey: "tooltip_gym" },
  { icon: "🍽️", nameKey: "mod_food", descKey: "tooltip_food" },
  { icon: "📊", nameKey: "mod_dashboard", descKey: "tooltip_dashboard" },
  { icon: "🤖", nameKey: "mod_ai", descKey: "tooltip_ai_chat" },
];

export default function LoginPage() {
  const t = useTranslations("login");
  const ts = useTranslations("settings");

  // Passkey state
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");

  async function handlePasskeySignIn() {
    setPasskeyError("");
    setPasskeyLoading(true);
    try {
      const { options, error: optErr } = await getPasskeyAuthenticationOptions();
      if (optErr || !options) {
        setPasskeyError(optErr || t("error_generic"));
        setPasskeyLoading(false);
        return;
      }
      const authResponse = await startAuthentication({ optionsJSON: options });
      const result = await verifyPasskeyAuthentication(authResponse);
      if (result.error) {
        setPasskeyError(result.error);
        setPasskeyLoading(false);
        return;
      }
      window.location.href = "/";
    } catch (e: unknown) {
      // User cancelled the dialog
      if (e instanceof Error && e.name === "NotAllowedError") {
        setPasskeyLoading(false);
        return;
      }
      setPasskeyError(t("error_generic"));
      setPasskeyLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 relative">
      {/* Header with logo + language selector */}
      <div className="flex flex-col items-center text-center mb-6">
        <img
          src="/PD.png"
          alt="Personal Dashboard"
          width={100}
          height={100}
          className="mb-3"
        />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="mt-2 mb-1">
          <LanguageToggle />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Auth buttons */}
      <Card className="w-full max-w-sm mb-8">
        <CardContent className="space-y-4 pt-6">
          {/* Google Sign In */}
          <Button
            className="w-full"
            size="lg"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            {t("sign_in_google")}
          </Button>

          {/* GitHub Sign In */}
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={() => signIn("github", { callbackUrl: "/" })}
          >
            Sign in with GitHub
          </Button>

          {/* Passkey Sign In */}
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            onClick={handlePasskeySignIn}
            disabled={passkeyLoading}
          >
            {passkeyLoading ? "..." : t("sign_in_passkey")}
          </Button>
          {passkeyError && (
            <p className="text-sm text-destructive text-center">{passkeyError}</p>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("or")}</span>
            </div>
          </div>

          <form action={enterDemoMode}>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              size="lg"
            >
              {t("try_demo")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center">
            {t("try_demo_help")}
          </p>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mt-2">
            <p className="text-xs text-amber-700 dark:text-amber-400 text-center">
              {t("invite_only")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* App description */}
      <div className="w-full max-w-2xl space-y-4">
        <Card className="p-6">
          <p className="text-sm text-foreground mb-4">{t("description")}</p>
          <div className="border-t pt-3 space-y-1">
            <p className="text-xs text-muted-foreground">{t("mod_integrations")}</p>
            <p className="text-xs text-muted-foreground">{t("mod_languages")}</p>
          </div>
        </Card>

        {/* Feature cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <Card key={f.nameKey} className="p-4 text-center">
              <div className="text-3xl mb-2">{f.icon}</div>
              <div className="text-sm font-semibold mb-1">{t(f.nameKey).split(" — ")[0]}</div>
              <div className="text-xs text-muted-foreground">{ts(f.descKey)}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
