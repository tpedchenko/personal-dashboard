"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { enterDemoMode } from "@/actions/demo";
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

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        // Register first, then sign in
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || t("error_generic"));
          setLoading(false);
          return;
        }
      }

      // Sign in with credentials
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("error_invalid_credentials"));
        setLoading(false);
        return;
      }

      // Redirect on success
      window.location.href = "/";
    } catch {
      setError(t("error_generic"));
      setLoading(false);
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

          {/* GitHub Sign In (optional) */}
          {process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true" && (
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={() => signIn("github", { callbackUrl: "/" })}
            >
              {t("sign_in_github")}
            </Button>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("or")}</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleCredentialsSubmit} className="space-y-3">
            {isRegister && (
              <div className="space-y-1">
                <Label htmlFor="name">{t("field_name")}</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("field_name_placeholder")}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">{t("field_email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("field_password")}</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? t("field_password_min") : ""}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              variant="outline"
              disabled={loading}
            >
              {loading
                ? "..."
                : isRegister
                  ? t("register")
                  : t("sign_in_email")}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            <button
              type="button"
              className="underline hover:text-foreground transition-colors"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
            >
              {isRegister ? t("have_account") : t("no_account")}
            </button>
          </p>

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
