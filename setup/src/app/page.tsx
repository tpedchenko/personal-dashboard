"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Globe, LayoutGrid, Plug, Shield, Database, Rocket,
  Wallet, TrendingUp, Heart, Dumbbell, Sun, Utensils,
  ShoppingCart, MessageSquare, Sparkles, BarChart3, FileText,
  ChevronRight, ChevronLeft, Check, Loader2, ExternalLink,
  Eye, EyeOff, CircleCheck, CircleAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Language = "en" | "uk" | "es";

interface Module {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  envFlag: string;
  defaultOn: boolean;
}

interface IntegrationField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

interface Integration {
  id: string;
  label: string;
  description: string;
  requiredModules: string[];
  fields: IntegrationField[];
}

type AuthMode = "google" | "github" | "demo";

interface Config {
  language: Language;
  modules: string[];
  integrations: Record<string, Record<string, string>>;
  auth: AuthMode;
  googleClientId: string;
  googleClientSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  seedDemo: boolean;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "Language", icon: <Globe size={16} /> },
  { label: "Modules", icon: <LayoutGrid size={16} /> },
  { label: "Integrations", icon: <Plug size={16} /> },
  { label: "Auth", icon: <Shield size={16} /> },
  { label: "Demo Data", icon: <Database size={16} /> },
  { label: "Deploy", icon: <Rocket size={16} /> },
];

const MODULES: Module[] = [
  { id: "finance", label: "Finance", desc: "Transactions, budgets, accounts, CSV import", icon: <Wallet size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_FINANCE", defaultOn: true },
  { id: "investments", label: "Investments", desc: "Portfolio, NAV, P&L, allocation", icon: <TrendingUp size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_INVESTMENTS", defaultOn: false },
  { id: "health", label: "Health", desc: "Garmin sync, sleep, HRV, Body Battery", icon: <Heart size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_HEALTH", defaultOn: true },
  { id: "gym", label: "Gym & Workouts", desc: "Exercises, programs, sets, PRs", icon: <Dumbbell size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_GYM", defaultOn: true },
  { id: "my_day", label: "My Day", desc: "Mood, energy, stress, journal", icon: <Sun size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_MY_DAY", defaultOn: true },
  { id: "food", label: "Food", desc: "Calories, protein, trends", icon: <Utensils size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_FOOD", defaultOn: false },
  { id: "shopping", label: "Shopping List", desc: "Shopping lists, quick expenses", icon: <ShoppingCart size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_SHOPPING", defaultOn: false },
  { id: "ai_chat", label: "AI Chat", desc: "Chat with your data (Gemini/Groq/Ollama)", icon: <MessageSquare size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_AI_CHAT", defaultOn: false },
  { id: "ai_insights", label: "AI Insights", desc: "Automatic analytical insights", icon: <Sparkles size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_AI_INSIGHTS", defaultOn: false },
  { id: "trading", label: "Trading", desc: "Freqtrade bot integration", icon: <BarChart3 size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_TRADING", defaultOn: false },
  { id: "reporting", label: "Tax Reporting", desc: "UA FOP / ES IRPF tax reports", icon: <FileText size={20} />, envFlag: "NEXT_PUBLIC_FEATURE_REPORTING", defaultOn: false },
];

const INTEGRATIONS: Integration[] = [
  { id: "garmin", label: "Garmin Connect", description: "Sync health data from Garmin", requiredModules: ["health"], fields: [
    { key: "GARMIN_EMAIL", label: "Garmin Email", placeholder: "your@email.com" },
    { key: "GARMIN_PASSWORD", label: "Garmin Password", placeholder: "password", type: "password" },
  ]},
  { id: "monobank", label: "Monobank", description: "Sync bank transactions", requiredModules: ["finance"], fields: [
    { key: "MONOBANK_TOKEN", label: "API Token", placeholder: "Token from api.monobank.ua" },
  ]},
  { id: "ibkr", label: "Interactive Brokers", description: "Sync investment portfolio via Flex Query", requiredModules: ["investments"], fields: [
    { key: "IBKR_FLEX_TOKEN", label: "Flex Query Token", placeholder: "Flex Web Service token" },
    { key: "IBKR_ACCOUNT_ID", label: "Account ID", placeholder: "e.g. U1234567" },
  ]},
  { id: "trading212", label: "Trading 212", description: "Sync investment positions", requiredModules: ["investments"], fields: [
    { key: "TRADING212_API_KEY", label: "API Key", placeholder: "Trading 212 API key" },
  ]},
  { id: "ai_provider", label: "AI Provider", description: "Choose your AI backend", requiredModules: ["ai_chat", "ai_insights"], fields: [
    { key: "AI_PROVIDER", label: "Provider", placeholder: "ollama / gemini / groq" },
    { key: "GEMINI_API_KEY", label: "Gemini API Key (if Gemini)", placeholder: "API key from ai.google.dev" },
    { key: "GROQ_API_KEY", label: "Groq API Key (if Groq)", placeholder: "API key from groq.com" },
  ]},
  { id: "kraken", label: "Kraken Exchange", description: "API keys for Freqtrade trading", requiredModules: ["trading"], fields: [
    { key: "KRAKEN_API_KEY", label: "API Key", placeholder: "Kraken API key" },
    { key: "KRAKEN_API_SECRET", label: "API Secret", placeholder: "Kraken API secret", type: "password" },
  ]},
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "es", label: "Español" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={cn(
              "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
              i < step && "bg-accent text-bg",
              i === step && "bg-accent text-bg ring-2 ring-accent/40 ring-offset-2 ring-offset-bg",
              i > step && "bg-bg-card text-text-muted border border-border"
            )}
          >
            {i < step ? <Check size={16} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={cn(
              "hidden sm:block w-8 md:w-12 h-0.5 mx-1 transition-colors duration-300",
              i < step ? "bg-accent" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-6 sm:p-8 w-full max-w-2xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-1">{title}</h2>
      {subtitle && <p className="text-text-muted text-sm mb-6">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function DeployLogViewer({ log, defaultOpen }: { log: string[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-text-muted hover:text-text flex items-center gap-1 mb-2"
      >
        <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
        {open ? "Hide" : "Show"} deploy log ({log.length} lines)
      </button>
      {open && (
        <div className="bg-bg-input rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs text-text-muted space-y-1">
          {log.map((line, i) => (
            <div key={i} className={cn(
              line.startsWith("ERROR") && "text-error",
              line.startsWith("WARNING") && "text-yellow-400",
              line.startsWith("[done]") && "text-success font-semibold",
              /^\[\d+\/\d+\]/.test(line) && "text-text",
            )}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerStatusPanel() {
  const [containers, setContainers] = useState<{ name: string; status: string; health: string }[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        setContainers(data.containers || []);
      } catch {
        // ignore
      }
    };
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  if (containers.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Container Status</h3>
      <div className="space-y-2">
        {containers.map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-sm">
            {c.health === "healthy" || c.health === "running" ? (
              <CircleCheck size={16} className="text-success flex-shrink-0" />
            ) : c.health === "starting" ? (
              <Loader2 size={16} className="text-accent animate-spin flex-shrink-0" />
            ) : (
              <CircleAlert size={16} className="text-error flex-shrink-0" />
            )}
            <code className="text-accent text-xs">{c.name}</code>
            <span className="text-text-muted text-xs">{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Wizard                                                        */
/* ------------------------------------------------------------------ */

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [deployDone, setDeployDone] = useState(false);

  const [config, setConfig] = useState<Config>({
    language: "en",
    modules: MODULES.filter((m) => m.defaultOn).map((m) => m.id),
    integrations: {},
    auth: "demo",
    googleClientId: "",
    googleClientSecret: "",
    githubClientId: "",
    githubClientSecret: "",
    seedDemo: true,
  });

  const toggleModule = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      modules: prev.modules.includes(id)
        ? prev.modules.filter((m) => m !== id)
        : [...prev.modules, id],
    }));
  }, []);

  const setIntegrationField = useCallback((integrationId: string, key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [integrationId]: { ...prev.integrations[integrationId], [key]: value },
      },
    }));
  }, []);

  const visibleIntegrations = INTEGRATIONS.filter((ig) =>
    ig.requiredModules.some((rm) => config.modules.includes(rm))
  );

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployLog([]);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const text = decoder.decode(value);
          const lines = text.split("\n").filter(Boolean);
          setDeployLog((prev) => [...prev, ...lines]);
        }
      }
      setDeployDone(true);
    } catch (err) {
      setDeployLog((prev) => [...prev, `ERROR: ${err instanceof Error ? err.message : "Deploy failed"}`]);
    } finally {
      setDeploying(false);
    }
  };

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return config.modules.length > 0;
    if (step === 3 && config.auth === "google") return config.googleClientId.length > 0 && config.googleClientSecret.length > 0;
    if (step === 3 && config.auth === "github") return config.githubClientId.length > 0 && config.githubClientSecret.length > 0;
    return true;
  };

  /* ---- Step renderers ---- */

  const renderLanguage = () => (
    <Card title="Choose Language" subtitle="Select the interface language for your dashboard">
      <div className="space-y-3">
        {LANGUAGES.map((lang) => (
          <label
            key={lang.value}
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all",
              config.language === lang.value
                ? "border-accent bg-accent/10"
                : "border-border hover:border-text-muted"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
              config.language === lang.value ? "border-accent" : "border-border"
            )}>
              {config.language === lang.value && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
            </div>
            <span className="font-medium">{lang.label}</span>
          </label>
        ))}
      </div>
    </Card>
  );

  const renderModules = () => (
    <Card title="Select Modules" subtitle="Choose which features to enable. You can change this later.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MODULES.map((mod) => {
          const active = config.modules.includes(mod.id);
          return (
            <label
              key={mod.id}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                active ? "border-accent bg-accent/10" : "border-border hover:border-text-muted"
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleModule(mod.id)}
                className="sr-only"
              />
              <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                active ? "border-accent bg-accent" : "border-border"
              )}>
                {active && <Check size={12} className="text-bg" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("transition-colors", active ? "text-accent" : "text-text-muted")}>{mod.icon}</span>
                  <span className="font-medium text-sm">{mod.label}</span>
                </div>
                <p className="text-text-muted text-xs mt-1">{mod.desc}</p>
              </div>
            </label>
          );
        })}
      </div>
    </Card>
  );

  const renderIntegrations = () => (
    <Card title="Integrations" subtitle="Connect external services. All fields are optional — you can configure them later.">
      {visibleIntegrations.length === 0 ? (
        <p className="text-text-muted text-sm">No integrations needed for your selected modules.</p>
      ) : (
        <div className="space-y-6">
          {visibleIntegrations.map((ig) => (
            <div key={ig.id} className="border border-border rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-1">{ig.label}</h3>
              <p className="text-text-muted text-xs mb-3">{ig.description}</p>
              <div className="space-y-3">
                {ig.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-text-muted mb-1 block">{field.label}</label>
                    {field.type === "password" ? (
                      <PasswordInput
                        value={config.integrations[ig.id]?.[field.key] || ""}
                        onChange={(v) => setIntegrationField(ig.id, field.key, v)}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        type="text"
                        value={config.integrations[ig.id]?.[field.key] || ""}
                        onChange={(e) => setIntegrationField(ig.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-text-muted text-xs mt-2 italic">Skip for now — you can add this later in Settings.</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const renderAuth = () => {
    const authOptions: { value: AuthMode; label: string; badge?: string; desc: string; helpUrl?: string }[] = [
      { value: "google", label: "Google OAuth", badge: "Recommended", desc: "Login with your Google account. Requires Client ID and Secret from console.cloud.google.com", helpUrl: "https://console.cloud.google.com/apis/credentials" },
      { value: "github", label: "GitHub OAuth", desc: "Login with your GitHub account. Create an OAuth App at github.com/settings/developers", helpUrl: "https://github.com/settings/developers" },
      { value: "demo", label: "Demo Mode", desc: "No authentication required. Best for testing and local use." },
    ];

    return (
      <Card title="Authentication" subtitle="How will you log in to your dashboard?">
        <div className="space-y-3">
          {authOptions.map((opt) => (
            <div key={opt.value}>
              <label
                className={cn(
                  "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                  config.auth === opt.value ? "border-accent bg-accent/10" : "border-border hover:border-text-muted"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors",
                  config.auth === opt.value ? "border-accent" : "border-border"
                )}>
                  {config.auth === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                </div>
                <div className="flex-1" onClick={() => setConfig((p) => ({ ...p, auth: opt.value }))}>
                  <span className="font-medium text-sm">{opt.label}</span>
                  {opt.badge && <span className="ml-2 text-xs text-accent">{opt.badge}</span>}
                  <p className="text-text-muted text-xs mt-1">{opt.desc}</p>
                </div>
              </label>

              {config.auth === "google" && opt.value === "google" && (
                <div className="ml-8 space-y-3 py-2">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Google Client ID</label>
                    <input
                      type="text"
                      value={config.googleClientId}
                      onChange={(e) => setConfig((p) => ({ ...p, googleClientId: e.target.value }))}
                      placeholder="123456789.apps.googleusercontent.com"
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Google Client Secret</label>
                    <PasswordInput
                      value={config.googleClientSecret}
                      onChange={(v) => setConfig((p) => ({ ...p, googleClientSecret: v }))}
                      placeholder="GOCSPX-..."
                    />
                  </div>
                  <a href={opt.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Get credentials <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {config.auth === "github" && opt.value === "github" && (
                <div className="ml-8 space-y-3 py-2">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">GitHub Client ID</label>
                    <input
                      type="text"
                      value={config.githubClientId}
                      onChange={(e) => setConfig((p) => ({ ...p, githubClientId: e.target.value }))}
                      placeholder="Ov23li..."
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">GitHub Client Secret</label>
                    <PasswordInput
                      value={config.githubClientSecret}
                      onChange={(v) => setConfig((p) => ({ ...p, githubClientSecret: v }))}
                      placeholder="secret..."
                    />
                  </div>
                  <div className="bg-bg-input rounded-lg p-3 text-xs text-text-muted space-y-1">
                    <p className="font-medium text-text">Callback URL for your OAuth App:</p>
                    <code className="text-accent bg-bg border border-border rounded px-2 py-1 block">http://localhost:3333/api/auth/callback/github</code>
                  </div>
                  <a href={opt.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Create OAuth App <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    );
  };

  const renderDemoData = () => (
    <Card title="Demo Data" subtitle="Optionally seed your database with sample data to explore features immediately.">
      <label
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
          config.seedDemo ? "border-accent bg-accent/10" : "border-border hover:border-text-muted"
        )}
      >
        <input type="checkbox" checked={config.seedDemo} onChange={(e) => setConfig((p) => ({ ...p, seedDemo: e.target.checked }))} className="sr-only" />
        <div className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
          config.seedDemo ? "border-accent bg-accent" : "border-border"
        )}>
          {config.seedDemo && <Check size={12} className="text-bg" />}
        </div>
        <div>
          <span className="font-medium text-sm">Seed demo data for quick start</span>
          <span className="ml-2 text-xs text-accent">Recommended</span>
          <p className="text-text-muted text-xs mt-1">Adds 50 transactions, 30 days of health data, and 20 workouts so you can explore right away.</p>
        </div>
      </label>
    </Card>
  );

  const renderDeploy = () => {
    const selectedModules = MODULES.filter((m) => config.modules.includes(m.id));
    const containers = [
      { name: "pd-app", desc: "Next.js Dashboard", always: true },
      { name: "pg", desc: "PostgreSQL", always: true },
      { name: "redis", desc: "Redis Cache", always: true },
      { name: "ollama", desc: "Local AI (Ollama)", always: false, condition: config.integrations.ai_provider?.AI_PROVIDER === "ollama" },
      { name: "freqtrade", desc: "Trading Bot", always: false, condition: config.modules.includes("trading") },
    ].filter((c) => c.always || c.condition);

    const hasErrors = deployLog.some((l) => l.startsWith("ERROR"));
    const autoDeployed = deployLog.some((l) => l.includes("Starting containers") || l.includes("Deployment complete"));
    const manualMode = deployLog.some((l) => l.includes("Docker socket not available"));

    if (deployDone) {
      return (
        <Card title={hasErrors ? "Deployment Issues" : "Setup Complete!"} subtitle={hasErrors ? "There were some issues during deployment." : "Your Personal Dashboard is deployed and running."}>
          {/* Deploy log (collapsed by default on success) */}
          <DeployLogViewer log={deployLog} defaultOpen={hasErrors} />

          {/* Container Status */}
          {autoDeployed && !hasErrors && <ContainerStatusPanel />}

          <div className="text-center space-y-4 mt-6">
            {manualMode ? (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">
                  Configuration files saved to <code className="text-accent bg-bg-input px-1.5 py-0.5 rounded text-xs">/data/</code>
                </p>
                <div className="bg-bg-input rounded-lg p-4 text-left">
                  <p className="text-xs text-text-muted mb-2">To deploy, run these commands:</p>
                  <div className="space-y-1 font-mono text-xs">
                    <p className="text-accent">cd /data</p>
                    <p className="text-accent">docker compose up -d</p>
                    <p className="text-accent">docker exec pd-app npx prisma migrate deploy</p>
                    {config.seedDemo && <p className="text-accent">docker exec -i pg psql -U pd pd_prod &lt; seed-demo-data.sql</p>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                Your dashboard is running. It may take a few seconds to fully start.
              </p>
            )}

            <a
              href="http://localhost:3333"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-bg font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Open Dashboard <ExternalLink size={16} />
            </a>

            <p className="text-xs text-text-muted">
              Dashboard URL: <code className="text-accent">http://localhost:3333</code>
            </p>
          </div>
        </Card>
      );
    }

    if (deploying) {
      // Calculate progress based on step markers in log
      const stepLines = deployLog.filter((l) => l.match(/^\[\d+\/\d+\]/));
      const lastStep = stepLines.length > 0 ? stepLines[stepLines.length - 1] : "";
      const match = lastStep.match(/^\[(\d+)\/(\d+)\]/);
      const progressPct = match ? Math.min(95, (parseInt(match[1]) / parseInt(match[2])) * 100) : Math.min(95, deployLog.length * 8);

      return (
        <Card title="Deploying..." subtitle="Setting up your Personal Dashboard">
          <div className="space-y-4">
            <div className="w-full bg-bg-input rounded-full h-2 overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="bg-bg-input rounded-lg p-4 max-h-72 overflow-y-auto font-mono text-xs text-text-muted space-y-1" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
              {deployLog.map((line, i) => (
                <div key={i} className={cn(
                  line.startsWith("ERROR") && "text-error",
                  line.startsWith("WARNING") && "text-yellow-400",
                  /^\[\d+\/\d+\]/.test(line) && "text-text font-semibold",
                )}>
                  {line}
                </div>
              ))}
              <div className="flex items-center gap-2 text-accent">
                <Loader2 size={12} className="animate-spin" /> Working...
              </div>
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card title="Review & Deploy" subtitle="Review your configuration before deploying.">
        <div className="space-y-5">
          {/* Language */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Language</h3>
            <p className="text-sm">{LANGUAGES.find((l) => l.value === config.language)?.label}</p>
          </div>

          {/* Modules */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Modules ({selectedModules.length})</h3>
            <div className="flex flex-wrap gap-2">
              {selectedModules.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/30 rounded-full px-3 py-1 text-xs font-medium">
                  {m.icon} {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* Auth */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Authentication</h3>
            <p className="text-sm">{config.auth === "google" ? "Google OAuth" : config.auth === "github" ? "GitHub OAuth" : "Demo Mode (no auth)"}</p>
          </div>

          {/* Demo Data */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Demo Data</h3>
            <p className="text-sm">{config.seedDemo ? "Yes — seed sample data" : "No — empty start"}</p>
          </div>

          {/* Containers */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Docker Containers</h3>
            <div className="space-y-1">
              {containers.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <code className="text-accent text-xs">{c.name}</code>
                  <span className="text-text-muted text-xs">-- {c.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-bg-input rounded-lg p-3 text-xs text-text-muted">
            <p>Clicking <strong className="text-text">Deploy Now</strong> will:</p>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Generate .env and docker-compose.yml</li>
              <li>Start all containers via Docker</li>
              <li>Run database migrations</li>
              {config.seedDemo && <li>Seed demo data (transactions, workouts, health)</li>}
            </ol>
          </div>

          <button
            onClick={handleDeploy}
            className="w-full bg-accent hover:bg-accent-hover text-bg font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Rocket size={18} /> Deploy Now
          </button>
        </div>
      </Card>
    );
  };

  const stepRenderers = [renderLanguage, renderModules, renderIntegrations, renderAuth, renderDemoData, renderDeploy];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-bold text-bg text-sm">PD</div>
            <span className="font-semibold text-sm hidden sm:block">Setup Wizard</span>
          </div>
          <span className="text-xs text-text-muted">Step {step + 1} of {STEPS.length}</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 sm:px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <Stepper step={step} total={STEPS.length} />
          {stepRenderers[step]()}
        </div>
      </main>

      {/* Footer Navigation */}
      {!deploying && !deployDone && (
        <footer className="border-t border-border px-4 sm:px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className={cn(
                "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                step === 0 ? "text-text-muted cursor-not-allowed" : "text-text hover:bg-bg-card"
              )}
            >
              <ChevronLeft size={16} /> Back
            </button>

            {step < STEPS.length - 1 && (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className={cn(
                  "flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                  canNext()
                    ? "bg-accent hover:bg-accent-hover text-bg"
                    : "bg-border text-text-muted cursor-not-allowed"
                )}
              >
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
