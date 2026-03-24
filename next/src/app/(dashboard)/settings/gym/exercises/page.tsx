"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { PencilIcon, CheckIcon, XIcon, TrashIcon, PlusIcon } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  createExercise,
  deleteExercise,
  updateExercise,
  getExercises,
  getExerciseUsageStats,
  getDefaultExercises,
  addDefaultExercise,
} from "@/actions/gym";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Traps",
  "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Forearms", "Cardio",
];

const EQUIPMENT_TYPES = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Bands", "Other",
];

type CustomExercise = {
  id: number;
  name: string;
  nameUa: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  secondaryMuscles: string | null;
  recoveryHours: number | null;
};

export default function GymExercisesPage() {
  const t = useTranslations("gym");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [exercises, setExercises] = useState<CustomExercise[]>([]);
  const [usageStats, setUsageStats] = useState<Record<number, { count: number; lastUsed: string | null; recentCount: number }>>({});
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("Chest");
  const [equipment, setEquipment] = useState("Barbell");
  const [secondaryMuscle, setSecondaryMuscle] = useState("");
  const [recoveryHours, setRecoveryHours] = useState("72");

  const [sortBy, setSortBy] = useState<"name" | "count" | "lastUsed">("count");

  // Default exercises state
  const [showDefaults, setShowDefaults] = useState(false);
  const [defaultExercises, setDefaultExercises] = useState<{name: string; muscleGroup: string; equipment: string; secondaryMuscles: string}[]>([]);
  const [defaultFilter, setDefaultFilter] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMuscle, setEditMuscle] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [editSecondary, setEditSecondary] = useState("");
  const [editRecovery, setEditRecovery] = useState("72");

  useEffect(() => {
    loadExercises();
  }, []);

  function loadExercises() {
    startTransition(async () => {
      const [data, stats] = await Promise.all([getExercises(), getExerciseUsageStats()]);
      setExercises(data);
      const statsMap: Record<number, { count: number; lastUsed: string | null; recentCount: number }> = {};
      for (const s of stats) {
        statsMap[s.exerciseId] = { count: s.count, lastUsed: s.lastUsed, recentCount: s.recentCount };
      }
      setUsageStats(statsMap);
    });
  }

  async function loadDefaults() {
    const defs = await getDefaultExercises();
    setDefaultExercises(defs);
    setShowDefaults(true);
  }

  function handleAddDefault(name: string) {
    startTransition(async () => {
      try {
        await addDefaultExercise(name);
        toast.success(t("exercise_added"));
        loadExercises();
        const defs = await getDefaultExercises();
        setDefaultExercises(defs);
      } catch { toast.error(t("exercise_exists")); }
    });
  }

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createExercise({
          name: name.trim(),
          muscleGroup,
          equipment,
          secondaryMuscles: secondaryMuscle || undefined,
          recoveryHours: parseInt(recoveryHours) || 72,
        });
        toast.success(t("exercise_added"));
        setName("");
        loadExercises();
      } catch {
        toast.error(t("exercise_exists"));
      }
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteExercise(id);
      toast.success(t("exercise_deleted"));
      loadExercises();
    });
  }

  function startEdit(ex: CustomExercise) {
    setEditingId(ex.id);
    setEditName(ex.name);
    setEditMuscle(ex.muscleGroup ?? "Chest");
    setEditEquipment(ex.equipment ?? "Barbell");
    setEditSecondary(ex.secondaryMuscles ?? "");
    setEditRecovery(String(ex.recoveryHours ?? 72));
  }

  function saveEdit(id: number) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await updateExercise(id, {
        name: editName.trim(),
        muscleGroup: editMuscle,
        equipment: editEquipment,
        secondaryMuscles: editSecondary || undefined,
        recoveryHours: parseInt(editRecovery) || 72,
      });
      setEditingId(null);
      toast.success(tc("saved"));
      loadExercises();
    });
  }

  return (
    <div className="space-y-4">
      {/* Add Custom Exercise Form */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">{t("add_exercise")}</h2>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("exercise_name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={t("exercise_name")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("muscle_group")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((mg) => (
                  <button
                    key={mg}
                    type="button"
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                      muscleGroup === mg
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"
                    }`}
                    onClick={() => setMuscleGroup(mg)}
                  >
                    {t(`muscle_groups.${mg}`) || mg}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("secondary_muscles")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.filter((mg) => mg !== muscleGroup).map((mg) => {
                  const selected = secondaryMuscle.split(",").map(s => s.trim()).filter(Boolean).includes(mg);
                  return (
                    <button
                      key={mg}
                      type="button"
                      className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"
                      }`}
                      onClick={() => {
                        const current = secondaryMuscle.split(",").map(s => s.trim()).filter(Boolean);
                        if (selected) {
                          setSecondaryMuscle(current.filter(s => s !== mg).join(","));
                        } else {
                          setSecondaryMuscle([...current, mg].join(","));
                        }
                      }}
                    >
                      {t(`muscle_groups.${mg}`) || mg}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("equipment")}</Label>
              <Select value={equipment} onValueChange={(v) => v && setEquipment(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((eq) => (
                    <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("recovery")} ({t("hours") || "h"})</Label>
              <Input
                type="number"
                min="12"
                max="168"
                value={recoveryHours}
                onChange={(e) => setRecoveryHours(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleAdd} disabled={isPending || !name.trim()}>
            {tc("add")}
          </Button>
        </div>
      </Card>

      {/* Exercises split by recent usage */}
      {(() => {
        const sortFn = (a: CustomExercise, b: CustomExercise) => {
          const sa = usageStats[a.id];
          const sb = usageStats[b.id];
          if (sortBy === "name") return (a.nameUa || a.name).localeCompare(b.nameUa || b.name);
          if (sortBy === "lastUsed") return (sb?.lastUsed ?? "").localeCompare(sa?.lastUsed ?? "");
          return (sb?.recentCount ?? 0) - (sa?.recentCount ?? 0);
        };
        const recentExercises = exercises.filter(ex => (usageStats[ex.id]?.recentCount ?? 0) > 0).sort(sortFn);
        const otherExercises = exercises.filter(ex => (usageStats[ex.id]?.recentCount ?? 0) === 0).sort(sortFn);

        const renderExercise = (ex: CustomExercise) => {
          const isEditing = editingId === ex.id;
          const stats = usageStats[ex.id];
          return (
            <div
              key={ex.id}
              className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 group"
            >
              {isEditing ? (
                <div className="flex flex-col gap-2 flex-1 mr-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" autoFocus placeholder="Name" />
                  <div className="flex flex-wrap gap-1.5">
                    <Label className="text-xs w-full">{t("primary_muscles")}</Label>
                    {MUSCLE_GROUPS.map((mg) => (
                      <button key={mg} type="button" className={`px-2 py-1 rounded-md text-xs border transition-colors ${editMuscle === mg ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"}`} onClick={() => setEditMuscle(mg)}>{t(`muscle_groups.${mg}`) || mg}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Label className="text-xs w-full">{t("secondary_muscles")}</Label>
                    {MUSCLE_GROUPS.filter(mg => mg !== editMuscle).map((mg) => {
                      const sel = editSecondary.split(",").map(s => s.trim()).filter(Boolean).includes(mg);
                      return (<button key={mg} type="button" className={`px-2 py-1 rounded-md text-xs border transition-colors ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-primary/50"}`} onClick={() => { const cur = editSecondary.split(",").map(s => s.trim()).filter(Boolean); setEditSecondary(sel ? cur.filter(s => s !== mg).join(",") : [...cur, mg].join(",")); }}>{t(`muscle_groups.${mg}`) || mg}</button>);
                    })}
                  </div>
                  <div className="flex gap-2 items-center">
                    <Select value={editEquipment} onValueChange={(v) => v && setEditEquipment(v)}>
                      <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{EQUIPMENT_TYPES.map(eq => <SelectItem key={eq} value={eq}>{eq}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min="12" max="168" value={editRecovery} onChange={(e) => setEditRecovery(e.target.value)} className="h-8 text-sm w-20" placeholder="Recovery h" />
                    <Button variant="ghost" size="sm" onClick={() => saveEdit(ex.id)} disabled={isPending}><CheckIcon className="size-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><XIcon className="size-4" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="font-medium">{ex.nameUa || ex.name}</span>
                    {ex.nameUa && <span className="ml-1 text-xs text-muted-foreground">({ex.name})</span>}
                    <span className="ml-2 text-sm text-muted-foreground">{t(`muscle_groups.${ex.muscleGroup}`) || ex.muscleGroup}</span>
                    {ex.secondaryMuscles && <span className="ml-1 text-xs text-muted-foreground">+{ex.secondaryMuscles}</span>}
                    <span className="text-xs text-muted-foreground ml-2">{ex.equipment}</span>
                    <span className="text-xs text-muted-foreground ml-2">{ex.recoveryHours ?? 72}h</span>
                    <span className="text-xs text-muted-foreground ml-1">({stats?.count ?? 0}×)</span>
                    {stats?.lastUsed && <span className="text-xs text-muted-foreground ml-1">{stats.lastUsed}</span>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(ex)} disabled={isPending}><PencilIcon className="size-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(ex.id)} disabled={isPending}><TrashIcon className="size-3.5" /></Button>
                  </div>
                </>
              )}
            </div>
          );
        };

        const groupByMuscle = (list: CustomExercise[]) => {
          const groups: Record<string, CustomExercise[]> = {};
          for (const ex of list) {
            const key = ex.muscleGroup || "__none__";
            if (!groups[key]) groups[key] = [];
            groups[key].push(ex);
          }
          // Sort group keys: named groups in MUSCLE_GROUPS order, then "__none__" last
          const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === "__none__") return 1;
            if (b === "__none__") return -1;
            const ia = MUSCLE_GROUPS.indexOf(a);
            const ib = MUSCLE_GROUPS.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });
          return sortedKeys.map(key => ({ key, label: key === "__none__" ? t("no_group") : (t(`muscle_groups.${key}`) || key), exercises: groups[key] }));
        };

        const renderMuscleGroups = (list: CustomExercise[]) => {
          const groups = groupByMuscle(list);
          return (
            <Accordion>
              {groups.map(({ key, label, exercises: exList }) => (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="py-2 px-1">
                    <span className="flex items-center gap-2">
                      {label}
                      <Badge variant="secondary" className="text-xs">{exList.length}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1">{exList.map(renderExercise)}</div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          );
        };

        return (
          <>
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("exercises_last_12m")}</h2>
                <div className="flex gap-1">
                  {(["count", "name", "lastUsed"] as const).map(s => (
                    <Button key={s} variant={sortBy === s ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setSortBy(s)}>
                      {s === "count" ? "×" : s === "name" ? "A-Z" : "📅"}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("exercises_last_12m_desc")}</p>
              {recentExercises.length === 0 ? (
                <p className="text-muted-foreground text-sm">{tc("no_data")}</p>
              ) : (
                renderMuscleGroups(recentExercises)
              )}
            </Card>

            {otherExercises.length > 0 && (
              <Card className="p-4 space-y-3">
                <h2 className="text-lg font-semibold">{t("other_exercises")}</h2>
                <p className="text-xs text-muted-foreground">{t("other_exercises_desc")}</p>
                {renderMuscleGroups(otherExercises)}
              </Card>
            )}
          </>
        );
      })()}

      {/* Default Exercises */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("default_exercises") || "Default Exercises"}</h2>
          <Button variant="outline" size="sm" onClick={loadDefaults}>
            {showDefaults ? tc("hide") || "Hide" : tc("show") || "Show"}
          </Button>
        </div>
        {showDefaults && (
          <>
            <Input
              value={defaultFilter}
              onChange={(e) => setDefaultFilter(e.target.value)}
              placeholder={tc("search") || "Search..."}
              className="h-8 text-sm"
            />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {defaultExercises
                .filter(e => !defaultFilter || e.name.toLowerCase().includes(defaultFilter.toLowerCase()) || e.muscleGroup.toLowerCase().includes(defaultFilter.toLowerCase()))
                .map((ex) => (
                  <div key={ex.name} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
                    <div>
                      <span className="text-sm font-medium">{ex.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ex.muscleGroup} / {ex.equipment}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleAddDefault(ex.name)} disabled={isPending}>
                      <PlusIcon className="size-3.5" />
                    </Button>
                  </div>
                ))}
              {defaultExercises.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">All default exercises already added</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
