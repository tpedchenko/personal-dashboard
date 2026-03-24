"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function BugReportPage() {
  const t = useTranslations("settings");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!description.trim()) {
      toast.error(t("bug_empty"));
      return;
    }
    startTransition(async () => {
      // TODO: implement actual bug report submission
      toast.success(t("bug_sent"));
      setDescription("");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("report_bug")}</h2>
        <div className="space-y-2">
          <Label>{t("bug_description")}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("bug_placeholder")}
            rows={5}
          />
        </div>
        <Button onClick={handleSubmit} disabled={isPending || !description.trim()}>
          {t("send_report")}
        </Button>
      </Card>
    </div>
  );
}
