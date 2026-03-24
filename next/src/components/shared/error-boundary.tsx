"use client";

import { Component, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
  /** @deprecated Use moduleName instead */
  module?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function ErrorFallback({ label, errorMessage, onRetry }: { label?: string; errorMessage?: string; onRetry: () => void }) {
  const tc = useTranslations("common");
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex items-center gap-3 py-4">
        <AlertTriangleIcon className="size-5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {label ? tc("error_in_module", { label }) : tc("error_section_load")}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {errorMessage}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
        >
          {tc("retry")}
        </Button>
      </CardContent>
    </Card>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private get label(): string | undefined {
    return this.props.moduleName ?? this.props.module;
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary${this.label ? `: ${this.label}` : ""}]`, error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorFallback
          label={this.label}
          errorMessage={this.state.error?.message}
          onRetry={() => this.setState({ hasError: false, error: undefined })}
        />
      );
    }
    return this.props.children;
  }
}
