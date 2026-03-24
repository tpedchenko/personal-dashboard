import { getFoodEntries, getDailySummary, getCalorieTrend } from "@/actions/food";
import { getUserPreference } from "@/actions/settings";
import { FoodPage } from "@/components/food/food-page";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { ModuleGate } from "@/components/shared/module-gate";
import { todayString } from "@/lib/date-utils";

export default async function FoodPageRoute() {
  const today = todayString();
  const [entries, summary, calorieTrend, calorieTargetPref] = await Promise.all([
    getFoodEntries(today),
    getDailySummary(today),
    getCalorieTrend(30),
    getUserPreference("calorie_target"),
  ]);

  const calorieTarget = calorieTargetPref ? parseInt(calorieTargetPref, 10) : 2000;

  return (
    <ModuleGate moduleKey="food">
      <FirstVisitBanner moduleKey="Food" />
      <FoodPage
        initialEntries={entries}
        initialSummary={summary}
        initialDate={today}
        initialCalorieTrend={calorieTrend}
        initialCalorieTarget={calorieTarget}
      />
    </ModuleGate>
  );
}
