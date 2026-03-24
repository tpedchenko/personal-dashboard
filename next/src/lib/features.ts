// Feature flags — control which modules are enabled
// Set via env vars or leave defaults (all enabled)

export const FEATURES = {
  finance: process.env.NEXT_PUBLIC_FEATURE_FINANCE !== "false",
  investments: process.env.NEXT_PUBLIC_FEATURE_INVESTMENTS !== "false",
  gym: process.env.NEXT_PUBLIC_FEATURE_GYM !== "false",
  health: process.env.NEXT_PUBLIC_FEATURE_HEALTH !== "false",
  food: process.env.NEXT_PUBLIC_FEATURE_FOOD !== "false",
  shopping: process.env.NEXT_PUBLIC_FEATURE_SHOPPING !== "false",
  trading: process.env.NEXT_PUBLIC_FEATURE_TRADING !== "false",
  reporting: process.env.NEXT_PUBLIC_FEATURE_REPORTING !== "false",
  aiChat: process.env.NEXT_PUBLIC_FEATURE_AI_CHAT !== "false",
  aiInsights: process.env.NEXT_PUBLIC_FEATURE_AI_INSIGHTS !== "false",
} as const;

export type FeatureKey = keyof typeof FEATURES;
export function isFeatureEnabled(key: FeatureKey): boolean { return FEATURES[key]; }
