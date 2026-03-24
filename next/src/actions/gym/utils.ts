/**
 * Pure data constants and utility functions for the gym module.
 * NOT a "use server" file — safe for non-async exports.
 */

// Default exercises library
export const DEFAULT_EXERCISES = [
  { name: "Bench Press", nameUa: "Жим лежачи", muscleGroup: "Chest", equipment: "Barbell", secondaryMuscles: "Triceps,Shoulders" },
  { name: "Incline Bench Press", nameUa: "Жим на похилій лавці", muscleGroup: "Chest", equipment: "Barbell", secondaryMuscles: "Shoulders,Triceps" },
  { name: "Dumbbell Fly", nameUa: "Розведення гантелей", muscleGroup: "Chest", equipment: "Dumbbell", secondaryMuscles: "" },
  { name: "Push-Up", nameUa: "Віджимання", muscleGroup: "Chest", equipment: "Bodyweight", secondaryMuscles: "Triceps,Shoulders" },
  { name: "Cable Crossover", nameUa: "Кросовер", muscleGroup: "Chest", equipment: "Cable", secondaryMuscles: "" },
  { name: "Deadlift", nameUa: "Станова тяга", muscleGroup: "Back", equipment: "Barbell", secondaryMuscles: "Hamstrings,Glutes,Core" },
  { name: "Barbell Row", nameUa: "Тяга штанги в нахилі", muscleGroup: "Back", equipment: "Barbell", secondaryMuscles: "Biceps" },
  { name: "Pull-Up", nameUa: "Підтягування", muscleGroup: "Back", equipment: "Bodyweight", secondaryMuscles: "Biceps" },
  { name: "Lat Pulldown", nameUa: "Тяга верхнього блоку", muscleGroup: "Back", equipment: "Cable", secondaryMuscles: "Biceps" },
  { name: "Seated Row", nameUa: "Тяга нижнього блоку", muscleGroup: "Back", equipment: "Cable", secondaryMuscles: "Biceps" },
  { name: "T-Bar Row", nameUa: "Тяга Т-грифа", muscleGroup: "Back", equipment: "Barbell", secondaryMuscles: "Biceps" },
  { name: "Overhead Press", nameUa: "Жим стоячи", muscleGroup: "Shoulders", equipment: "Barbell", secondaryMuscles: "Triceps" },
  { name: "Lateral Raise", nameUa: "Махи гантелями в сторони", muscleGroup: "Shoulders", equipment: "Dumbbell", secondaryMuscles: "Traps" },
  { name: "Face Pull", nameUa: "Тяга до обличчя", muscleGroup: "Shoulders", equipment: "Cable", secondaryMuscles: "Traps" },
  { name: "Front Raise", nameUa: "Підйом гантелей перед собою", muscleGroup: "Shoulders", equipment: "Dumbbell", secondaryMuscles: "" },
  { name: "Rear Delt Fly", nameUa: "Розведення на задні дельти", muscleGroup: "Shoulders", equipment: "Dumbbell", secondaryMuscles: "Back" },
  { name: "Barbell Curl", nameUa: "Підйом штанги на біцепс", muscleGroup: "Biceps", equipment: "Barbell", secondaryMuscles: "Forearms" },
  { name: "Dumbbell Curl", nameUa: "Підйом гантелей на біцепс", muscleGroup: "Biceps", equipment: "Dumbbell", secondaryMuscles: "Forearms" },
  { name: "Hammer Curl", nameUa: "Молоткові згинання", muscleGroup: "Biceps", equipment: "Dumbbell", secondaryMuscles: "Forearms" },
  { name: "Tricep Pushdown", nameUa: "Розгинання на трицепс", muscleGroup: "Triceps", equipment: "Cable", secondaryMuscles: "" },
  { name: "Skull Crusher", nameUa: "Французький жим", muscleGroup: "Triceps", equipment: "Barbell", secondaryMuscles: "" },
  { name: "Dips", nameUa: "Віджимання на брусах", muscleGroup: "Triceps", equipment: "Bodyweight", secondaryMuscles: "Chest,Shoulders" },
  { name: "Squat", nameUa: "Присідання", muscleGroup: "Quads", equipment: "Barbell", secondaryMuscles: "Glutes,Core" },
  { name: "Leg Press", nameUa: "Жим ногами", muscleGroup: "Quads", equipment: "Machine", secondaryMuscles: "Glutes" },
  { name: "Leg Extension", nameUa: "Розгинання ніг", muscleGroup: "Quads", equipment: "Machine", secondaryMuscles: "" },
  { name: "Romanian Deadlift", nameUa: "Румунська тяга", muscleGroup: "Hamstrings", equipment: "Barbell", secondaryMuscles: "Glutes,Back" },
  { name: "Leg Curl", nameUa: "Згинання ніг", muscleGroup: "Hamstrings", equipment: "Machine", secondaryMuscles: "" },
  { name: "Hip Thrust", nameUa: "Сідничний міст", muscleGroup: "Glutes", equipment: "Barbell", secondaryMuscles: "Hamstrings" },
  { name: "Calf Raise", nameUa: "Підйом на носки", muscleGroup: "Calves", equipment: "Machine", secondaryMuscles: "" },
  { name: "Plank", nameUa: "Планка", muscleGroup: "Core", equipment: "Bodyweight", secondaryMuscles: "" },
  { name: "Cable Crunch", nameUa: "Скручування на блоці", muscleGroup: "Core", equipment: "Cable", secondaryMuscles: "" },
  { name: "Shrugs", nameUa: "Шраги", muscleGroup: "Traps", equipment: "Dumbbell", secondaryMuscles: "Shoulders" },
];
