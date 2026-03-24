"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { getSecret, setSecret, getUserPreference, setUserPreference } from "@/actions/settings";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

type ProviderConfig = {
  key: string;
  label: string;
  model: string;
  tier: string;
  placeholder: string;
  secretKey: string;
};

const providers: ProviderConfig[] = [
  {
    key: "gemini",
    label: "Google Gemini",
    model: "Gemini 2.5 Flash",
    tier: "Free: 15 RPM, 1M tokens/day",
    placeholder: "AIzaSy...",
    secretKey: "gemini_api_key",
  },
  {
    key: "groq",
    label: "Groq",
    model: "Llama 3.3 70B",
    tier: "Free: 30 RPM, 14.4K tokens/min",
    placeholder: "gsk_...",
    secretKey: "groq_api_key",
  },
  {
    key: "anthropic",
    label: "Anthropic Claude",
    model: "Claude 3.5 Sonnet",
    tier: "Paid: $3/$15 per 1M tokens",
    placeholder: "sk-ant-...",
    secretKey: "anthropic_api_key",
  },
  {
    key: "huggingface",
    label: "Hugging Face",
    model: "Inference API",
    tier: "Free with rate limits",
    placeholder: "hf_...",
    secretKey: "huggingface_api_key",
  },
];

type OllamaStatus = "checking" | "online" | "offline" | "error";
type OllamaModel = { name: string; size: number };

export default function AiProvidersPage() {
  const isDemo = useDemoMode();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [configuredCount, setConfiguredCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [defaultModel, setDefaultModel] = useState("ollama");
  const [refreshSchedule, setRefreshSchedule] = useState("daily");
  const [refreshMethod, setRefreshMethod] = useState("knowledge");
  const [refreshing, setRefreshing] = useState(false);

  const checkOllama = useCallback(async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("/api/ollama/status");
      const data = await res.json();
      setOllamaStatus(data.status as OllamaStatus);
      setOllamaModels(data.models || []);
    } catch {
      setOllamaStatus("offline");
    }
  }, []);

  useEffect(() => {
    startTransition(async () => {
      const [savedModel, savedSchedule, savedMethod, ...values] = await Promise.all([
        getUserPreference("ai_chat_model"),
        getUserPreference("ollama_refresh_schedule"),
        getUserPreference("ollama_refresh_method"),
        ...providers.map((p) => getSecret(p.secretKey)),
      ]);
      if (savedModel) setDefaultModel(savedModel);
      if (savedSchedule) setRefreshSchedule(savedSchedule);
      if (savedMethod) setRefreshMethod(savedMethod);
      const results: Record<string, string> = {};
      let count = 0;
      providers.forEach((p, i) => {
        if (values[i]) {
          results[p.secretKey] = values[i]!;
          count++;
        }
      });
      setKeys(results);
      setConfiguredCount(count);
    });
    checkOllama();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKeyChange(secretKey: string, value: string) {
    setKeys((prev) => ({ ...prev, [secretKey]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const promises = providers
        .filter((p) => keys[p.secretKey]?.trim())
        .map((p) => setSecret(p.secretKey, keys[p.secretKey].trim()));
      await Promise.all(promises);

      let count = 0;
      for (const p of providers) {
        if (keys[p.secretKey]?.trim()) count++;
      }
      setConfiguredCount(count);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  async function handleDefaultModelChange(value: string) {
    setDefaultModel(value);
    await setUserPreference("ai_chat_model", value);
    toast.success("Default model saved");
  }

  return (
    <div className="space-y-4">
      {isDemo && <p className="text-xs text-muted-foreground">Read-only in demo mode</p>}
      {/* Default model selector */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">Default AI Model</h2>
        <p className="text-xs text-muted-foreground">
          Used by default in AI Chat. You can switch per-conversation.
        </p>
        <RadioGroup value={defaultModel} onValueChange={handleDefaultModelChange} className="space-y-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="ollama" />
            <Label className="cursor-pointer">Ollama Llama 3.1 (Local)</Label>
            <Badge variant="secondary" className="text-[10px]">Free / Private</Badge>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="gemini" />
            <Label className="cursor-pointer">Gemini 2.5 Flash</Label>
            <Badge variant="secondary" className="text-[10px]">Cloud</Badge>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="groq" />
            <Label className="cursor-pointer">Groq Llama 3.3 70B</Label>
            <Badge variant="secondary" className="text-[10px]">Cloud</Badge>
          </div>
        </RadioGroup>
      </Card>

      {/* Ollama (Local) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">Ollama (Local)</span>
            <span className="text-xs text-muted-foreground ml-2">
              Llama 3.1 8B
            </span>
          </div>
          <Badge
            variant={ollamaStatus === "online" ? "default" : "secondary"}
            className="text-xs"
          >
            {ollamaStatus === "checking"
              ? "..."
              : ollamaStatus === "online"
                ? "Online"
                : "Offline"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Local CPU inference — free, private, no API key needed. ~8 tok/s on Mini.
        </p>
        {ollamaStatus === "online" && ollamaModels.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Models: {ollamaModels.map((m) => m.name).join(", ")}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={checkOllama}>
          Check status
        </Button>
      </Card>

      {/* Local Model Training */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Local Model Training</h2>
        <p className="text-xs text-muted-foreground">
          Configure how and when the local model gets updated with your personal data.
        </p>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Refresh Schedule</Label>
            <RadioGroup
              value={refreshSchedule}
              onValueChange={async (v) => {
                setRefreshSchedule(v);
                await setUserPreference("ollama_refresh_schedule", v);
                toast.success("Schedule saved");
              }}
              className="space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="daily" />
                <Label className="cursor-pointer text-sm">Daily at 1:00 AM</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" />
                <Label className="cursor-pointer text-sm">Weekly (Monday 1:00 AM)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" />
                <Label className="cursor-pointer text-sm">Manual only</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Training Method</Label>
            <RadioGroup
              value={refreshMethod}
              onValueChange={async (v) => {
                setRefreshMethod(v);
                await setUserPreference("ollama_refresh_method", v);
                toast.success("Method saved");
              }}
              className="space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="knowledge" />
                <div>
                  <Label className="cursor-pointer text-sm">Knowledge Refresh</Label>
                  <p className="text-[10px] text-muted-foreground ml-0">Fast (~5s) — injects fresh data into system prompt</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="lora" disabled />
                <div>
                  <Label className="cursor-pointer text-sm text-muted-foreground">LoRA Fine-Tune</Label>
                  <p className="text-[10px] text-muted-foreground ml-0">Slow (~6h on CPU) — deeper personalization. Coming soon.</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isDemo || refreshing || ollamaStatus !== "online"}
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await fetch("/api/ollama/refresh", { method: "POST" });
                  if (res.ok) {
                    toast.success("Model refreshed with latest data");
                  } else {
                    toast.error("Refresh failed");
                  }
                } catch {
                  toast.error("Refresh failed");
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh Now"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Cloud providers */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("integration_ai")}</h2>
          <Badge variant={configuredCount > 0 ? "default" : "secondary"}>
            {configuredCount} / {providers.length} configured
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          API keys for AI-powered features: chat, transaction categorization, import column detection.
        </p>

        <div className="space-y-4">
          {providers.map((provider) => {
            const hasKey = !!keys[provider.secretKey]?.trim();
            return (
              <div key={provider.key} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{provider.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {provider.model}
                    </span>
                  </div>
                  <Badge variant={hasKey ? "default" : "secondary"} className="text-xs">
                    {hasKey ? "✓" : "—"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{provider.tier}</p>
                <div>
                  <Label className="text-xs">API Key</Label>
                  <Input
                    type="password"
                    value={keys[provider.secretKey] ?? ""}
                    onChange={(e) => handleKeyChange(provider.secretKey, e.target.value)}
                    placeholder={provider.placeholder}
                    className="text-sm"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={handleSave} disabled={isDemo || isPending}>
          {tc("save")}
        </Button>

        {saved && (
          <p className="text-sm text-green-600">{tc("success")}</p>
        )}
      </Card>
    </div>
  );
}
