"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { useRef, useEffect, useState, useTransition, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SendIcon, Trash2Icon, BotIcon, UserIcon, Loader2Icon, SparklesIcon, ExternalLinkIcon } from "lucide-react";
import { clearChatHistory } from "@/actions/chat-history";
import { getUserPreference, setUserPreference } from "@/actions/settings";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Parse and strip /filter commands from AI response text
function parseFilterCommands(text: string): { cleanText: string; filters: Array<{ key: string; value: string }> } {
  const filterRegex = /\/filter\s+(\w+)=([^\s]+)/g;
  const filters: Array<{ key: string; value: string }> = [];
  let match;
  while ((match = filterRegex.exec(text)) !== null) {
    filters.push({ key: match[1], value: match[2] });
  }
  const cleanText = text.replace(/\/filter\s+\w+=\S+/g, "").trim();
  return { cleanText, filters };
}

export function ChatPage({ initialMessages }: { initialMessages: UIMessage[] }) {
  const t = useTranslations("ai_chat");
  const router = useRouter();
  const [model, setModel] = useState("ollama");
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  // Load saved model preference
  useEffect(() => {
    getUserPreference("ai_chat_model").then((saved) => {
      if (saved) {
        setModel(saved);
        modelRef.current = saved;
      }
    });
  }, []);

  function handleModelChange(v: string | null) {
    if (!v) return;
    setModel(v);
    setUserPreference("ai_chat_model", v);
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelRef.current }),
      }),
    []
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect filter commands in the latest assistant message
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant") {
        const filters = getMessageFilters(lastMsg);
        if (filters.length > 0) {
          filters.forEach((f) => {
            toast.success(`${t("filter_applied_toast")}: ${f.key} = ${f.value}`);
          });
        }
      }
    }
    prevMessageCountRef.current = messages.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const handleClear = () => {
    startTransition(async () => {
      await clearChatHistory();
      setMessages([]);
    });
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    sendMessage({ text });
  };

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  const suggestions = [
    t("suggestion_1"),
    t("suggestion_2"),
    t("suggestion_3"),
    t("suggestion_4"),
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getMessageText = (message: UIMessage): string => {
    const raw = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (message.role === "assistant") {
      const { cleanText } = parseFilterCommands(raw);
      return cleanText;
    }
    return raw;
  };

  const getMessageFilters = (message: UIMessage): Array<{ key: string; value: string }> => {
    const raw = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    const { filters } = parseFilterCommands(raw);
    return filters;
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col"
         style={{ height: "calc(100dvh - 10rem)" }}>
      {/* Header */}
      <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between sm:mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">{t("ask_title")}</h1>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger className="w-[160px] h-9 text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini 2.5 Flash</SelectItem>
              <SelectItem value="groq">Groq Llama 3.3</SelectItem>
              <SelectItem value="ollama">Ollama Llama 3.1 (Local)</SelectItem>
            </SelectContent>
          </Select>
          {hasMessages && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={isPending}
              className="h-9"
            >
              <Trash2Icon className="size-4 sm:mr-1" />
              <span className="hidden sm:inline">{t("clear_history")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <SparklesIcon className="size-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                {t("ask_title")}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
                {t("ask_desc")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 w-full max-w-lg">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="text-xs sm:text-sm text-left h-auto py-3 px-4 whitespace-normal text-balance"
                    onClick={() => handleSuggestion(s)}
                    disabled={isLoading}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 size-8 rounded-full flex items-center justify-center ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.role === "user" ? (
                        <UserIcon className="size-4" />
                      ) : (
                        <BotIcon className="size-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] sm:max-w-[75%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-sm whitespace-pre-wrap ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted rounded-tl-sm"
                      }`}
                    >
                      {getMessageText(message)}
                      {message.role === "assistant" && getMessageFilters(message).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {getMessageFilters(message).map((f, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set(f.key, f.value);
                                router.push(`/finance?${params.toString()}`);
                              }}
                            >
                              <ExternalLinkIcon className="size-3" />
                              {t("go_to_finance")}: {f.value}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 size-8 rounded-full flex items-center justify-center bg-muted">
                      <BotIcon className="size-4" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                      <Loader2Icon className="size-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Input area */}
      <div className="mt-4 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          className="min-h-[44px] max-h-32 resize-none"
          disabled={isLoading}
          rows={1}
        />
        <Button
          type="button"
          size="icon"
          disabled={isLoading || !input.trim()}
          className="shrink-0 size-11"
          onClick={handleSend}
        >
          {isLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SendIcon className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
