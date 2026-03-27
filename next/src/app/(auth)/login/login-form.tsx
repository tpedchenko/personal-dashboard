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
  { icon: "\u{1F4B0}", nameKey: "mod_finance", descKey: "tooltip_finance" },
  { icon: "\u{1F4C5}", nameKey: "mod_my_day", descKey: "tooltip_my_day" },
  { icon: "\u{1F3CB}\u{FE0F}", nameKey: "mod_gym", descKey: "tooltip_gym" },
  { icon: "\u{1F37D}\u{FE0F}", nameKey: "mod_food", descKey: "tooltip_food" },
  { icon: "\u{1F4CA}", nameKey: "mod_dashboard", descKey: "tooltip_dashboard" },
  { icon: "\u{1F916}", nameKey: "mod_ai", descKey: "tooltip_ai_chat" },
];

export function LoginForm({ githubEnabled }: { githubEnabled: boolean }) {
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
          {githubEnabled && (
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => signIn("github", { callbackUrl: "/" })}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {t("sign_in_github")}
            </Button>
          )}

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
              <div className="text-sm font-semibold mb-1">{t(f.nameKey).split(" \u2014 ")[0]}</div>
              <div className="text-xs text-muted-foreground">{ts(f.descKey)}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
