"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { getDailyLog, getGarminData, getGarminSleepData, getPreviousMoodLevel, saveDailyLog, getRecentLogs } from "@/actions/my-day";
import { DailyLogData, GarminData, GarminSleepData, RecentLogEntry, formatDate, getMoodEmoji } from "./types";
import { DateNavigator } from "./date-navigator";
import { GarminMoodCards } from "./garmin-mood-cards";
import { DailyLogForm } from "./daily-log-form";
import { RecentLogsTable } from "./recent-logs-table";

export function MyDayPage({
  initialLog,
  initialGarmin,
  initialGarminSleep,
  initialPrevLevel,
  initialDate,
}: {
  initialLog: DailyLogData;
  initialGarmin: GarminData;
  initialGarminSleep: GarminSleepData;
  initialPrevLevel: number;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [log, setLog] = useState<DailyLogData>(initialLog);
  const [garmin, setGarmin] = useState<GarminData>(initialGarmin);
  const [garminSleep, setGarminSleep] = useState<GarminSleepData>(initialGarminSleep);
  const [prevLevel, setPrevLevel] = useState<number>(initialPrevLevel);
  const [isPending, startTransition] = useTransition();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [energy, setEnergy] = useState<number>(initialLog?.energyLevel ?? 3);
  const [stress, setStress] = useState<number>(initialLog?.stressLevel ?? 1);
  const [focus, setFocus] = useState<number>(initialLog?.focusQuality ?? 3);
  const [moodDelta, setMoodDelta] = useState<number>(initialLog?.moodDelta ?? 0);
  const [alcohol, setAlcohol] = useState<number>(initialLog?.alcohol ?? 0);
  const [caffeine, setCaffeine] = useState<number>(initialLog?.caffeine ?? 0);
  const [kidsMinutes, setKidsMinutes] = useState<number>(
    Math.round((initialLog?.kidsHours ?? 0) * 60)
  );
  const [kidsNote, setKidsNote] = useState<string>(initialLog?.kidsNote ?? "");
  const [generalNote, setGeneralNote] = useState<string>(
    initialLog?.generalNote ?? ""
  );
  const [sexCount, setSexCount] = useState<number>(initialLog?.sexCount ?? 0);
  const [bjCount, setBjCount] = useState<number>(initialLog?.bjCount ?? 0);

  // Recent logs state
  const [recentLogs, setRecentLogs] = useState<RecentLogEntry[]>([]);
  const [recentLogsOpen, setRecentLogsOpen] = useState(false);
  const [recentLogsLoaded, setRecentLogsLoaded] = useState(false);

  // Computed mood level
  const newLevel = Math.round((prevLevel + moodDelta * 0.2) * 100) / 100;
  const moodInfo = getMoodEmoji(newLevel);

  const syncFormFromLog = useCallback((logData: DailyLogData) => {
    setEnergy(logData?.energyLevel ?? 3);
    setStress(logData?.stressLevel ?? 1);
    setFocus(logData?.focusQuality ?? 3);
    setMoodDelta(logData?.moodDelta ?? 0);
    setAlcohol(logData?.alcohol ?? 0);
    setCaffeine(logData?.caffeine ?? 0);
    setKidsMinutes(Math.round((logData?.kidsHours ?? 0) * 60));
    setKidsNote(logData?.kidsNote ?? "");
    setGeneralNote(logData?.generalNote ?? "");
    setSexCount(logData?.sexCount ?? 0);
    setBjCount(logData?.bjCount ?? 0);
  }, []);

  const reload = useCallback(
    (newDate: string) => {
      startTransition(async () => {
        const [l, g, gs, pl] = await Promise.all([
          getDailyLog(newDate),
          getGarminData(newDate),
          getGarminSleepData(newDate),
          getPreviousMoodLevel(newDate),
        ]);
        setLog(l);
        setGarmin(g);
        setGarminSleep(gs);
        setPrevLevel(pl);
        syncFormFromLog(l);
      });
    },
    [syncFormFromLog]
  );

  const handleDateSelect = (d: Date | undefined) => {
    if (!d) return;
    const ds = formatDate(d);
    setDate(ds);
    setCalendarOpen(false);
    setSaved(false);
    reload(ds);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const ds = formatDate(d);
    setDate(ds);
    setSaved(false);
    reload(ds);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const ds = formatDate(d);
    setDate(ds);
    setSaved(false);
    reload(ds);
  };

  const handleSave = () => {
    startTransition(async () => {
      await saveDailyLog({
        date,
        energyLevel: energy,
        stressLevel: stress,
        focusQuality: focus,
        moodDelta,
        alcohol,
        caffeine,
        kidsHours: Math.round((kidsMinutes / 60) * 100) / 100,
        kidsNote: kidsNote || undefined,
        generalNote: generalNote || undefined,
        sexCount,
        bjCount,
      });
      setSaved(true);
      reload(date);
      // Refresh recent logs if they're open
      if (recentLogsOpen) {
        const logs = await getRecentLogs(7);
        setRecentLogs(logs);
      }
    });
  };

  const loadRecentLogs = useCallback(() => {
    startTransition(async () => {
      const logs = await getRecentLogs(7);
      setRecentLogs(logs);
      setRecentLogsLoaded(true);
    });
  }, []);

  const handleToggleRecentLogs = () => {
    const next = !recentLogsOpen;
    setRecentLogsOpen(next);
    if (next && !recentLogsLoaded) {
      loadRecentLogs();
    }
  };

  const handleRecentLogCellSave = (logDate: string, field: string, value: number | undefined) => {
    startTransition(async () => {
      await saveDailyLog({
        date: logDate,
        [field]: value,
      });
      const logs = await getRecentLogs(7);
      setRecentLogs(logs);
    });
  };

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  return (
    <div className="space-y-6">
      <DateNavigator
        date={date}
        calendarOpen={calendarOpen}
        onCalendarOpenChange={setCalendarOpen}
        onDateSelect={handleDateSelect}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
      />

      <GarminMoodCards
        garmin={garmin}
        garminSleep={garminSleep}
        newLevel={newLevel}
        prevLevel={prevLevel}
        moodInfo={moodInfo}
      />

      <DailyLogForm
        moodDelta={moodDelta}
        onMoodDeltaChange={setMoodDelta}
        energy={energy}
        onEnergyChange={setEnergy}
        stress={stress}
        onStressChange={setStress}
        focus={focus}
        onFocusChange={setFocus}
        sexCount={sexCount}
        onSexCountChange={setSexCount}
        bjCount={bjCount}
        onBjCountChange={setBjCount}
        alcohol={alcohol}
        onAlcoholChange={setAlcohol}
        caffeine={caffeine}
        onCaffeineChange={setCaffeine}
        kidsMinutes={kidsMinutes}
        onKidsMinutesChange={setKidsMinutes}
        generalNote={generalNote}
        onGeneralNoteChange={setGeneralNote}
        onSave={handleSave}
        isPending={isPending}
        saved={saved}
      />

      <RecentLogsTable
        recentLogs={recentLogs}
        recentLogsOpen={recentLogsOpen}
        onToggle={handleToggleRecentLogs}
        onCellSave={handleRecentLogCellSave}
      />
    </div>
  );
}
