"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { RefObject } from "react";

interface AddItemFormProps {
  formRef: RefObject<HTMLFormElement | null>;
  itemInputRef: RefObject<HTMLInputElement | null>;
  isPending: boolean;
  onSubmit: (formData: FormData) => void;
}

export function AddItemForm({
  formRef,
  itemInputRef,
  isPending,
  onSubmit,
}: AddItemFormProps) {
  const t = useTranslations("list");

  return (
    <>
      <form
        ref={formRef}
        action={onSubmit}
        className="flex items-center gap-2"
      >
        <Input
          ref={itemInputRef}
          name="itemName"
          placeholder={t("item_name")}
          required
          className="flex-1"
          autoComplete="off"
        />
        <Input
          name="quantity"
          placeholder={t("quantity")}
          className="w-20"
          autoComplete="off"
        />
        <Button type="submit" size="icon" disabled={isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
      <p className="text-muted-foreground -mt-4 text-xs">
        {t("bulk_hint")}
      </p>
    </>
  );
}
