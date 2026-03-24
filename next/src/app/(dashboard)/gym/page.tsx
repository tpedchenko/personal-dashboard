import { getWorkouts, getExercises, getGymStats, getPrograms, getMuscleRecovery, getWorkoutCalendar, getFavoriteExerciseIds, getRecentGarminActivities } from "@/actions/gym";
import { GymPage } from "@/components/gym/gym-page";
import { FirstVisitBanner } from "@/components/shared/first-visit-banner";
import { ModuleGate } from "@/components/shared/module-gate";
import { todayString } from "@/lib/date-utils";

function monthStartString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export default async function GymPageRoute() {
  const today = todayString();
  const monthStart = monthStartString();
  const now = new Date();

  const [workouts, exercises, stats, programs, muscleRecovery, calendarData, favoriteIds, recentGarminActivities] = await Promise.all([
    getWorkouts(20),
    getExercises(),
    getGymStats({ from: monthStart, to: today }),
    getPrograms(),
    getMuscleRecovery(),
    getWorkoutCalendar(now.getFullYear(), now.getMonth() + 1),
    getFavoriteExerciseIds(),
    getRecentGarminActivities(),
  ]);

  return (
    <ModuleGate moduleKey="gym">
    <FirstVisitBanner moduleKey="Gym" />
    <GymPage
      initialWorkouts={workouts}
      initialExercises={exercises}
      initialStats={stats}
      initialPrograms={programs}
      initialMuscleRecovery={muscleRecovery}
      initialCalendarData={calendarData}
      initialCalendarYear={now.getFullYear()}
      initialCalendarMonth={now.getMonth() + 1}
      initialFavoriteIds={favoriteIds}
      initialGarminActivities={recentGarminActivities}
    />
    </ModuleGate>
  );
}
