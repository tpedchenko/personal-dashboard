import { getDailyLog, getGarminData, getGarminSleepData, getPreviousMoodLevel } from "@/actions/my-day";
import { MyDayPage } from "@/components/my-day/my-day-page";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { InsightsPanel } from "@/components/insights/insights-panel";
import { ModuleGate } from "@/components/shared/module-gate";
import { todayString } from "@/lib/date-utils";

export default async function MyDayPageRoute() {
  const today = todayString();
  const [log, garmin, garminSleep, prevLevel] = await Promise.all([
    getDailyLog(today),
    getGarminData(today),
    getGarminSleepData(today),
    getPreviousMoodLevel(today),
  ]);

  return (
    <ModuleGate moduleKey="my_day">
    <FirstVisitBanner moduleKey="My Day" />
    <MyDayPage
      initialLog={log}
      initialGarmin={garmin}
      initialGarminSleep={garminSleep}
      initialPrevLevel={prevLevel}
      initialDate={today}
    />
    <InsightsPanel page="my-day" />
    </ModuleGate>
  );
}
