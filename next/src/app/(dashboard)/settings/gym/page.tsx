"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getPrograms,
  getExercises,
  createProgram,
  updateProgram,
  deleteProgram,
  addProgramDay,
  deleteProgramDay,
  addExerciseToProgramDay,
  updateProgramExercise,
  removeProgramExercise,
} from "@/actions/gym";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";

type Exercise = { id: number; name: string; nameUa: string | null; muscleGroup: string | null; equipment: string | null };

type ProgramExercise = {
  id: number;
  orderNum: number | null;
  targetSets: number | null;
  targetReps: string | null;
  exercise: Pick<Exercise, "id" | "name" | "nameUa">;
};

type ProgramDay = {
  id: number;
  dayNum: number;
  dayName: string;
  focus: string | null;
  exercises: ProgramExercise[];
};

type Program = {
  id: number;
  name: string;
  description: string | null;
  programType: string | null;
  daysPerWeek: number | null;
  days: ProgramDay[];
};

export default function GymPlanningPage() {
  const t = useTranslations("gym");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  function exName(ex: Pick<Exercise, "name" | "nameUa">) {
    if (locale === "uk" && ex.nameUa) return `${ex.nameUa} (${ex.name})`;
    return ex.name;
  }

  const [programs, setPrograms] = useState<Program[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [expandedProgram, setExpandedProgram] = useState<number | null>(null);

  // Create program form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("");
  const [newDays, setNewDays] = useState("3");

  // Add day form
  const [addDayFor, setAddDayFor] = useState<number | null>(null);
  const [dayName, setDayName] = useState("");
  const [dayFocus, setDayFocus] = useState("");

  // Edit program
  const [editingProgram, setEditingProgram] = useState<number | null>(null);
  const [editProgramName, setEditProgramName] = useState("");
  const [editProgramDesc, setEditProgramDesc] = useState("");
  const [editProgramType, setEditProgramType] = useState("");
  const [editProgramDays, setEditProgramDays] = useState("3");

  // Add exercise to day (two-step: muscle group → exercise)
  const [addExForDay, setAddExForDay] = useState<number | null>(null);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [exSets, setExSets] = useState("3");
  const [exReps, setExReps] = useState("8-12");

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    startTransition(async () => {
      const [p, e] = await Promise.all([getPrograms(), getExercises()]);
      setPrograms(p as Program[]);
      setExercises(e as Exercise[]);
    });
  }

  function handleCreateProgram() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await createProgram({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        programType: newType.trim() || undefined,
        daysPerWeek: parseInt(newDays) || 3,
      });
      setNewName("");
      setNewDesc("");
      setNewType("");
      setNewDays("3");
      toast.success(t("program_created"));
      loadData();
    });
  }

  function handleDeleteProgram(id: number) {
    startTransition(async () => {
      await deleteProgram(id);
      toast.success(tc("delete"));
      loadData();
    });
  }

  function startEditProgram(p: Program) {
    setEditingProgram(p.id);
    setEditProgramName(p.name);
    setEditProgramDesc(p.description ?? "");
    setEditProgramType(p.programType ?? "");
    setEditProgramDays(String(p.daysPerWeek ?? 3));
  }

  function saveEditProgram(id: number) {
    if (!editProgramName.trim()) return;
    startTransition(async () => {
      await updateProgram(id, {
        name: editProgramName.trim(),
        description: editProgramDesc.trim() || undefined,
        programType: editProgramType.trim() || undefined,
        daysPerWeek: parseInt(editProgramDays) || 3,
      });
      setEditingProgram(null);
      toast.success(tc("saved"));
      loadData();
    });
  }

  function handleAddDay(programId: number) {
    if (!dayName.trim()) return;
    startTransition(async () => {
      await addProgramDay(programId, dayName.trim(), dayFocus.trim() || undefined);
      setDayName("");
      setDayFocus("");
      setAddDayFor(null);
      loadData();
    });
  }

  function handleDeleteDay(dayId: number) {
    startTransition(async () => {
      await deleteProgramDay(dayId);
      loadData();
    });
  }

  function handleAddExercise(dayId: number) {
    if (!selectedExercise) return;
    startTransition(async () => {
      await addExerciseToProgramDay(
        dayId,
        parseInt(selectedExercise),
        parseInt(exSets) || 3,
        exReps || "8-12"
      );
      setSelectedExercise("");
      setSelectedMuscleGroup(null);
      setExSets("3");
      setExReps("8-12");
      setAddExForDay(null);
      loadData();
    });
  }

  function handleRemoveExercise(peId: number) {
    startTransition(async () => {
      await removeProgramExercise(peId);
      loadData();
    });
  }

  return (
    <div className="space-y-4">
      {/* Program List */}
      {programs.length === 0 ? (
        <Card className="p-4">
          <p className="text-muted-foreground">{t("no_programs")}</p>
        </Card>
      ) : (
        programs.map((program) => {
          const isExpanded = expandedProgram === program.id;
          return (
            <Card key={program.id} className="p-4 space-y-3">
              {editingProgram === program.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{tc("name")}</Label>
                      <Input className="h-8 text-sm" value={editProgramName} onChange={(e) => setEditProgramName(e.target.value)} autoFocus />
                    </div>
                    <div>
                      <Label className="text-xs">{t("program_description")}</Label>
                      <Input className="h-8 text-sm" value={editProgramDesc} onChange={(e) => setEditProgramDesc(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("program_type")}</Label>
                      <Input className="h-8 text-sm" value={editProgramType} onChange={(e) => setEditProgramType(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("days_per_week")}</Label>
                      <Input className="h-8 text-sm" type="number" min="1" max="7" value={editProgramDays} onChange={(e) => setEditProgramDays(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEditProgram(program.id)} disabled={isPending || !editProgramName.trim()}>
                      <CheckIcon className="size-4 mr-1" /> {tc("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingProgram(null)}>
                      <XIcon className="size-4 mr-1" /> {tc("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpandedProgram(isExpanded ? null : program.id)}
                  className="flex items-center gap-2 text-left"
                >
                  {isExpanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                  <span className="font-semibold">{program.name}</span>
                  {program.programType && (
                    <Badge variant="secondary">{program.programType}</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {program.daysPerWeek} {t("days_per_week")} · {program.days.length} {t("days_count")}
                  </span>
                </button>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditProgram(program)}
                    disabled={isPending}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDeleteProgram(program.id)}
                    disabled={isPending}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </div>
              )}

              {editingProgram !== program.id && program.description && (
                <p className="text-sm text-muted-foreground">{program.description}</p>
              )}

              {isExpanded && (
                <div className="space-y-4 mt-2">
                  {/* Days */}
                  {program.days.map((day) => (
                    <div key={day.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{day.dayName}</span>
                          {day.focus && (
                            <span className="text-sm text-muted-foreground ml-2">({day.focus})</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeleteDay(day.id)}
                          disabled={isPending}
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>

                      {/* Day exercises */}
                      {day.exercises.length > 0 && (
                        <div className="space-y-1">
                          {day.exercises.map((pe) => (
                            <div key={pe.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
                              <span>{exName(pe.exercise)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  {pe.targetSets} × {pe.targetReps}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveExercise(pe.id)}
                                  disabled={isPending}
                                >
                                  <XIcon className="size-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add exercise to day */}
                      {addExForDay === day.id ? (
                        selectedMuscleGroup === null ? (
                          /* Step 1: Pick muscle group */
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{t("muscle_group")}</span>
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setAddExForDay(null); setSelectedMuscleGroup(null); }}>
                                <XIcon className="size-3" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(new Set(exercises.map((e) => e.muscleGroup).filter(Boolean))).sort().map((mg) => (
                                <Button
                                  key={mg}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setSelectedMuscleGroup(mg!)}
                                >
                                  {t(`muscle_groups.${mg}`) || mg}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          /* Step 2: Pick exercise from selected group + sets/reps */
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => { setSelectedMuscleGroup(null); setSelectedExercise(""); }}>
                                <ChevronUpIcon className="size-3 mr-0.5" /> {t(`muscle_groups.${selectedMuscleGroup}`) || selectedMuscleGroup}
                              </Button>
                            </div>
                            <div className="flex gap-2 items-end flex-wrap">
                              <div className="flex-1 min-w-[300px]">
                                <Select value={selectedExercise} onValueChange={(v) => v && setSelectedExercise(v)}>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={t("exercise_name")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {exercises
                                      .filter((ex) => ex.muscleGroup === selectedMuscleGroup)
                                      .map((ex) => (
                                        <SelectItem key={ex.id} value={String(ex.id)}>
                                          {exName(ex)}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Input className="w-16 h-8 text-sm" value={exSets} onChange={(e) => setExSets(e.target.value)} placeholder={t("sets")} />
                              <Input className="w-20 h-8 text-sm" value={exReps} onChange={(e) => setExReps(e.target.value)} placeholder={t("reps")} />
                              <Button size="sm" className="h-8" onClick={() => handleAddExercise(day.id)} disabled={isPending || !selectedExercise}>
                                <CheckIcon className="size-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddExForDay(null); setSelectedMuscleGroup(null); setSelectedExercise(""); }}>
                                <XIcon className="size-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setAddExForDay(day.id); setSelectedMuscleGroup(null); setSelectedExercise(""); }}
                          className="text-xs"
                        >
                          <PlusIcon className="size-3 mr-1" /> {t("add_exercise")}
                        </Button>
                      )}
                    </div>
                  ))}

                  {/* Add day */}
                  {addDayFor === program.id ? (
                    <div className="flex gap-2 items-end">
                      <div>
                        <Label className="text-xs">{t("day_name")}</Label>
                        <Input className="h-8 text-sm" value={dayName} onChange={(e) => setDayName(e.target.value)} placeholder="Push, Pull, Legs..." />
                      </div>
                      <div>
                        <Label className="text-xs">{t("day_focus")}</Label>
                        <Input className="h-8 text-sm" value={dayFocus} onChange={(e) => setDayFocus(e.target.value)} placeholder="chest, shoulders" />
                      </div>
                      <Button size="sm" className="h-8" onClick={() => handleAddDay(program.id)} disabled={isPending || !dayName.trim()}>
                        <CheckIcon className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddDayFor(null)}>
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddDayFor(program.id)}
                    >
                      <PlusIcon className="size-3 mr-1" /> {t("add_day")}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* Create Program */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("create_program")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{tc("name")}</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Upper/Lower Split" />
          </div>
          <div>
            <Label>{t("program_description")}</Label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
          <div>
            <Label>{t("program_type")}</Label>
            <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="PPL, Upper/Lower, Full Body" />
          </div>
          <div>
            <Label>{t("days_per_week")}</Label>
            <Input type="number" min="1" max="7" value={newDays} onChange={(e) => setNewDays(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleCreateProgram} disabled={isPending || !newName.trim()}>
          {tc("add")}
        </Button>
      </Card>
    </div>
  );
}
