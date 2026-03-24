"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTENSITY_OPTIONS, INTENSITY_COLORS } from "./gym-constants";

export interface SetEditFormProps {
  editWeight: string;
  editReps: string;
  editIntensity: string;
  onEditWeightChange: (value: string) => void;
  onEditRepsChange: (value: string) => void;
  onEditIntensityChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}

/** Shared intensity select used in both mobile and desktop edit forms. */
function IntensitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-28 h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INTENSITY_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt}>
            <span className={INTENSITY_COLORS[opt]}>{opt}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Mobile inline set editing form (card layout). */
export function SetEditFormMobile({
  setLabel,
  editWeight,
  editReps,
  editIntensity,
  onEditWeightChange,
  onEditRepsChange,
  onEditIntensityChange,
  onSave,
  onCancel,
  isPending,
}: SetEditFormProps & { setLabel: string }) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-6 text-center text-sm">
          {setLabel}
        </span>
        <Input
          type="number"
          value={editWeight}
          onChange={(e) => onEditWeightChange(e.target.value)}
          className="w-20 h-8 text-right"
          placeholder={t("kg")}
        />
        <span className="text-muted-foreground">{"\u00d7"}</span>
        <Input
          type="number"
          value={editReps}
          onChange={(e) => onEditRepsChange(e.target.value)}
          className="w-16 h-8 text-right"
          placeholder={t("reps")}
        />
      </div>
      <div className="flex items-center gap-2">
        <IntensitySelect value={editIntensity} onChange={onEditIntensityChange} />
        <div className="flex gap-1 ml-auto">
          <Button size="xs" onClick={onSave} disabled={isPending}>
            {tc("save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Desktop inline set editing — renders TableCell elements for weight, reps, intensity, and actions. */
export function SetEditFormDesktopCells({
  editWeight,
  editReps,
  editIntensity,
  onEditWeightChange,
  onEditRepsChange,
  onEditIntensityChange,
  onSave,
  onCancel,
  isPending,
}: SetEditFormProps) {
  const t = useTranslations("gym");
  const tc = useTranslations("common");

  return (
    <>
      <TableCell className="text-right">
        <Input
          type="number"
          value={editWeight}
          onChange={(e) => onEditWeightChange(e.target.value)}
          className="w-16 ml-auto text-right"
          placeholder={t("kg")}
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          value={editReps}
          onChange={(e) => onEditRepsChange(e.target.value)}
          className="w-16 ml-auto text-right"
          placeholder={t("reps")}
        />
      </TableCell>
      <TableCell>
        <IntensitySelect value={editIntensity} onChange={onEditIntensityChange} />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="xs" onClick={onSave} disabled={isPending}>
            {tc("save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </TableCell>
    </>
  );
}
