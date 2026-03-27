"use server";

import { prisma } from "@/lib/db";
import { toDateOnly, dateToString } from "@/lib/date-utils";

/**
 * Build health context sections: daily log, garmin daily, garmin sleep, food log, weight.
 */
export async function buildHealthContext(
  userId: number,
  allowedSections: string[],
  today: Date,
  fourteenDaysAgo: Date,
): Promise<string[]> {
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const parts: string[] = [];

  // Daily log
  if (allowedSections.includes("daily_log")) {
    const dailyLogs = await prisma.dailyLog.findMany({
      where: { date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) }, userId },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (dailyLogs.length > 0) {
      const logLines = dailyLogs.map((d) => {
        const items: string[] = [`  ${dateToString(d.date)}:`];
        if (d.level != null) items.push(`level=${d.level}`);
        if (d.moodDelta != null) items.push(`mood_delta=${d.moodDelta}`);
        if (d.energyLevel != null) items.push(`energy=${d.energyLevel}`);
        if (d.stressLevel != null) items.push(`stress=${d.stressLevel}`);
        if (d.focusQuality != null) items.push(`focus=${d.focusQuality}`);
        if (d.alcohol != null && d.alcohol > 0) items.push(`alcohol=${d.alcohol}`);
        if (d.kidsHours != null && d.kidsHours > 0) items.push(`kids=${d.kidsHours}h`);
        if (d.generalNote) items.push(`note="${d.generalNote}"`);
        return items.join(" ");
      });
      parts.push(`Daily Log (last 14 days):\n${logLines.join("\n")}`);
    }
  }

  // Garmin daily
  if (allowedSections.includes("garmin_daily")) {
    const garminDaily = await prisma.garminDaily.findMany({
      where: { userId, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (garminDaily.length > 0) {
      const gLines = garminDaily.map((g) => {
        const items: string[] = [`  ${dateToString(g.date)}:`];
        if (g.steps != null) items.push(`steps=${g.steps}`);
        if (g.sleepSeconds != null) items.push(`sleep=${(g.sleepSeconds / 3600).toFixed(1)}h`);
        if (g.restingHr != null) items.push(`restHR=${g.restingHr}`);
        if (g.avgStress != null) items.push(`stress=${g.avgStress}`);
        if (g.bodyBatteryHigh != null) items.push(`bodyBattery=${g.bodyBatteryLow}-${g.bodyBatteryHigh}`);
        if (g.sleepScore != null) items.push(`sleepScore=${g.sleepScore}`);
        if (g.caloriesTotal != null) items.push(`cal=${g.caloriesTotal}`);
        if (g.hrvLastNight != null) items.push(`hrv=${g.hrvLastNight}ms`);
        return items.join(" ");
      });
      parts.push(`Garmin Daily (last 14 days):\n${gLines.join("\n")}`);
    }
  }

  // Garmin sleep
  if (allowedSections.includes("garmin_sleep")) {
    const garminSleep = await prisma.garminSleep.findMany({
      where: { userId, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      take: 14,
    });
    if (garminSleep.length > 0) {
      const sLines = garminSleep.map((s) => {
        const hrs = s.durationSeconds ? (s.durationSeconds / 3600).toFixed(1) : "?";
        const items: string[] = [`  ${dateToString(s.date)}: ${hrs}h total`];
        if (s.deepSeconds) items.push(`deep=${(s.deepSeconds / 60).toFixed(0)}m`);
        if (s.remSeconds) items.push(`rem=${(s.remSeconds / 60).toFixed(0)}m`);
        if (s.sleepScore != null) items.push(`score=${s.sleepScore}`);
        return items.join(" ");
      });
      parts.push(`Sleep (last 14 days):\n${sLines.join("\n")}`);
    }
  }

  // Food log
  if (allowedSections.includes("food_log")) {
    const foodLogs = await prisma.foodLog.findMany({
      where: { userId, date: { gte: toDateOnly(fmtDate(fourteenDaysAgo)) } },
      orderBy: { date: "desc" },
      select: { date: true, calories: true, proteinG: true, description: true },
    });
    if (foodLogs.length > 0) {
      const byDate: Record<string, { calories: number; protein: number; items: string[] }> = {};
      for (const fl of foodLogs) {
        if (!byDate[dateToString(fl.date)]) byDate[dateToString(fl.date)] = { calories: 0, protein: 0, items: [] };
        byDate[dateToString(fl.date)].calories += fl.calories ?? 0;
        byDate[dateToString(fl.date)].protein += fl.proteinG ?? 0;
        if (fl.description) byDate[dateToString(fl.date)].items.push(fl.description);
      }
      const dates = Object.keys(byDate).sort().reverse().slice(0, 7);
      const fLines = dates.map((d) => {
        const data = byDate[d];
        return `  ${d}: ${data.calories.toFixed(0)} kcal, ${data.protein.toFixed(0)}g protein`;
      });
      parts.push(`Food Log (last 7 days):\n${fLines.join("\n")}`);
    }
  }

  // Weight
  if (allowedSections.includes("weight")) {
    const latestWeight = await prisma.garminBodyComposition.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { date: true, weight: true, bodyFatPct: true },
    });
    if (latestWeight) {
      const wItems = [`Latest weight (${latestWeight.date}): ${latestWeight.weight}kg`];
      if (latestWeight.bodyFatPct != null) wItems.push(`fat=${latestWeight.bodyFatPct}%`);
      parts.push(wItems.join(" "));
    }
  }

  return parts;
}
