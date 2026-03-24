"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function getFavoriteExerciseIds(): Promise<number[]> {
  const user = await requireUser();
  const pref = await prisma.userPreference.findUnique({
    where: {
      userId_key: { userId: user.id, key: "favorite_exercises" },
    },
  });
  if (!pref?.value) return [];
  try {
    return JSON.parse(pref.value) as number[];
  } catch (e) {
    console.error("[gym/getFavoriteExerciseIds] JSON parse error:", e);
    return [];
  }
}

export async function toggleFavoriteExercise(exerciseId: number): Promise<boolean> {
  const user = await requireUser();
  const current = await getFavoriteExerciseIds();
  const isFav = current.includes(exerciseId);
  const updated = isFav
    ? current.filter((id) => id !== exerciseId)
    : [...current, exerciseId];

  await prisma.userPreference.upsert({
    where: {
      userId_key: { userId: user.id, key: "favorite_exercises" },
    },
    create: {
      userId: user.id,
      key: "favorite_exercises",
      value: JSON.stringify(updated),
    },
    update: {
      value: JSON.stringify(updated),
    },
  });

  updateTag(CACHE_TAGS.gym);
  return !isFav; // returns new state
}
