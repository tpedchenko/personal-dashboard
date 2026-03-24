"use client";

import { useState, useTransition } from "react";
import { ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { submitInsightFeedback } from "@/actions/insights";

type Props = {
  insightId: number;
  page: string;
  period: string;
  variant?: string;
  initialReaction?: string | null;
};

const SUGGESTIONS = [
  { en: "More specific numbers", ua: "Більше конкретних чисел", es: "Más números específicos" },
  { en: "Compare with previous period", ua: "Порівняй з минулим періодом", es: "Compara con el período anterior" },
  { en: "Shorter and to the point", ua: "Коротше і по суті", es: "Más corto y al grano" },
  { en: "More actionable recommendations", ua: "Більше практичних рекомендацій", es: "Más recomendaciones prácticas" },
];

export function InsightFeedbackButtons({ insightId, page, period, variant = "default", initialReaction }: Props) {
  const t = useTranslations("common");
  const [reaction, setReaction] = useState<string | null>(initialReaction ?? null);
  const [showDialog, setShowDialog] = useState(false);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleLike() {
    setReaction("like");
    startTransition(async () => {
      await submitInsightFeedback(insightId, page, period, "like", undefined, variant);
    });
  }

  function handleDislike() {
    setShowDialog(true);
  }

  function submitDislike() {
    setReaction("dislike");
    startTransition(async () => {
      await submitInsightFeedback(insightId, page, period, "dislike", comment, variant);
      setShowDialog(false);
      setComment("");
    });
  }

  return (
    <>
      <div className={`flex items-center gap-0.5 ml-auto ${!insightId ? "hidden" : ""}`}>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ${reaction === "like" ? "text-green-500" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
          onClick={handleLike}
          disabled={isPending}
        >
          <ThumbsUpIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ${reaction === "dislike" ? "text-red-500" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
          onClick={handleDislike}
          disabled={isPending}
        >
          <ThumbsDownIcon className="size-3.5" />
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("how_to_improve") || "How to improve?"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    comment.includes(s.en) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"
                  }`}
                  onClick={() => {
                    const suggestion = s.en;
                    setComment(prev => prev ? prev + ". " + suggestion : suggestion);
                  }}
                >
                  {s.en}
                </button>
              ))}
            </div>
            <textarea
              className="w-full border rounded-md p-2 min-h-[80px] text-sm bg-background"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("describe_issue") || "Describe what could be better..."}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={submitDislike} disabled={isPending || !comment.trim()}>
                {t("send") || "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
