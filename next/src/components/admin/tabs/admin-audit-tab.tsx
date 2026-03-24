"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AuditEntry = {
  id: number;
  userEmail: string;
  action: string;
  details: string | null;
  createdAt: Date | null;
};

type Props = {
  auditLogs: AuditEntry[];
};

export function AdminAuditTab({ auditLogs }: Props) {
  const t = useTranslations("admin");

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-3">{t("audit_log")}</h2>
      {auditLogs.length === 0 ? (
        <p className="text-muted-foreground">{t("no_audit_logs")}</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 text-sm border-b border-border pb-2"
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {log.createdAt
                  ? new Date(log.createdAt).toLocaleString("en")
                  : "—"}
              </span>
              <Badge variant="outline">{log.action}</Badge>
              <span className="text-muted-foreground">{log.userEmail}</span>
              {log.details && (
                <span className="text-foreground">{log.details}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
