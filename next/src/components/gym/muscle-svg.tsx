"use client";

/**
 * Simplified anatomical SVG body outline with muscle group highlighting.
 * Two views: front and back, auto-selected based on which muscle is highlighted.
 */

const FRONT_MUSCLES = new Set([
  "chest", "abdominals", "quadriceps", "biceps", "shoulders", "adductors", "neck", "core",
]);

const BACK_MUSCLES = new Set([
  "back", "lats", "traps", "hamstrings", "glutes", "calves", "triceps", "lower back",
  "forearms", "abductors",
]);

const HIGHLIGHT_COLOR = "#ef4444";
const BASE_FILL = "#374151";       // gray-700 — dark silhouette
const BASE_STROKE = "#4b5563";     // gray-600
const OUTLINE_STROKE = "#6b7280";  // gray-500

type MuscleSvgProps = {
  highlight: string;
  size?: number;
};

function isBackView(muscle: string): boolean {
  const key = muscle.toLowerCase();
  if (BACK_MUSCLES.has(key)) return true;
  return false;
}

function fillFor(muscle: string, highlight: string): string {
  return muscle.toLowerCase() === highlight.toLowerCase() ? HIGHLIGHT_COLOR : BASE_FILL;
}

function opacityFor(muscle: string, highlight: string): number {
  return muscle.toLowerCase() === highlight.toLowerCase() ? 0.85 : 0.15;
}

function FrontBody({ highlight }: { highlight: string }) {
  const f = (name: string) => fillFor(name, highlight);
  const o = (name: string) => opacityFor(name, highlight);

  return (
    <g transform="translate(50, 10)">
      {/* Head */}
      <ellipse cx="50" cy="18" rx="14" ry="17" fill="none" stroke={OUTLINE_STROKE} strokeWidth="1.2" />
      {/* Neck */}
      <rect x="44" y="35" width="12" height="10" fill={f("neck")} opacity={o("neck")} stroke={BASE_STROKE} strokeWidth="0.5" rx="2" />

      {/* Shoulders */}
      <ellipse cx="22" cy="52" rx="14" ry="9" fill={f("shoulders")} opacity={o("shoulders")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <ellipse cx="78" cy="52" rx="14" ry="9" fill={f("shoulders")} opacity={o("shoulders")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Chest */}
      <path d="M 32,48 Q 50,44 68,48 Q 72,60 68,70 Q 50,74 32,70 Q 28,60 32,48 Z"
        fill={f("chest")} opacity={o("chest")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Biceps */}
      <path d="M 8,56 Q 4,72 6,88 Q 14,90 18,88 Q 20,72 16,56 Z"
        fill={f("biceps")} opacity={o("biceps")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 92,56 Q 96,72 94,88 Q 86,90 82,88 Q 80,72 84,56 Z"
        fill={f("biceps")} opacity={o("biceps")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Core / Abdominals */}
      <path d="M 36,72 Q 50,70 64,72 L 64,108 Q 50,112 36,108 Z"
        fill={f(highlight.toLowerCase() === "abdominals" ? "abdominals" : "core")}
        opacity={o(highlight.toLowerCase() === "abdominals" ? "abdominals" : "core")}
        stroke={BASE_STROKE} strokeWidth="0.7" />
      {/* Ab lines */}
      <line x1="50" y1="74" x2="50" y2="106" stroke={BASE_STROKE} strokeWidth="0.4" opacity="0.5" />
      <line x1="38" y1="82" x2="62" y2="82" stroke={BASE_STROKE} strokeWidth="0.3" opacity="0.4" />
      <line x1="38" y1="92" x2="62" y2="92" stroke={BASE_STROKE} strokeWidth="0.3" opacity="0.4" />

      {/* Forearms */}
      <path d="M 4,90 Q 0,106 2,120 Q 8,122 14,120 Q 18,106 16,90 Z"
        fill={f("forearms")} opacity={o("forearms")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 96,90 Q 100,106 98,120 Q 92,122 86,120 Q 82,106 84,90 Z"
        fill={f("forearms")} opacity={o("forearms")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Adductors (inner thigh) */}
      <path d="M 40,112 L 48,112 L 46,148 L 42,148 Z"
        fill={f("adductors")} opacity={o("adductors")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 52,112 L 60,112 L 58,148 L 54,148 Z"
        fill={f("adductors")} opacity={o("adductors")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Quadriceps */}
      <path d="M 30,112 Q 28,136 30,162 Q 38,164 46,162 Q 48,136 46,112 Z"
        fill={f("quadriceps")} opacity={o("quadriceps")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 54,112 Q 52,136 54,162 Q 62,164 70,162 Q 72,136 70,112 Z"
        fill={f("quadriceps")} opacity={o("quadriceps")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Calves */}
      <path d="M 32,168 Q 30,186 32,204 Q 38,206 44,204 Q 46,186 44,168 Z"
        fill={f("calves")} opacity={o("calves")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 56,168 Q 54,186 56,204 Q 62,206 68,204 Q 70,186 68,168 Z"
        fill={f("calves")} opacity={o("calves")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Feet */}
      <path d="M 30,206 Q 30,212 38,212 L 44,212 Q 46,206 44,204" fill="none" stroke={OUTLINE_STROKE} strokeWidth="0.7" />
      <path d="M 56,206 Q 54,212 62,212 L 68,212 Q 70,206 68,204" fill="none" stroke={OUTLINE_STROKE} strokeWidth="0.7" />
    </g>
  );
}

function BackBody({ highlight }: { highlight: string }) {
  const f = (name: string) => fillFor(name, highlight);
  const o = (name: string) => opacityFor(name, highlight);

  return (
    <g transform="translate(50, 10)">
      {/* Head */}
      <ellipse cx="50" cy="18" rx="14" ry="17" fill="none" stroke={OUTLINE_STROKE} strokeWidth="1.2" />
      {/* Neck */}
      <rect x="44" y="35" width="12" height="10" fill="none" stroke={OUTLINE_STROKE} strokeWidth="0.5" rx="2" />

      {/* Traps */}
      <path d="M 32,44 Q 50,38 68,44 L 72,56 Q 50,52 28,56 Z"
        fill={f("traps")} opacity={o("traps")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Shoulders */}
      <ellipse cx="22" cy="52" rx="14" ry="9" fill={f("shoulders")} opacity={o("shoulders")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <ellipse cx="78" cy="52" rx="14" ry="9" fill={f("shoulders")} opacity={o("shoulders")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Lats */}
      <path d="M 28,56 Q 24,72 26,92 Q 36,96 44,92 Q 42,72 38,56 Z"
        fill={f("lats")} opacity={o("lats")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 72,56 Q 76,72 74,92 Q 64,96 56,92 Q 58,72 62,56 Z"
        fill={f("lats")} opacity={o("lats")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Back (mid back) */}
      <path d="M 38,56 Q 50,54 62,56 L 62,86 Q 50,90 38,86 Z"
        fill={f("back")} opacity={o("back")} stroke={BASE_STROKE} strokeWidth="0.7" />
      {/* Spine line */}
      <line x1="50" y1="56" x2="50" y2="106" stroke={BASE_STROKE} strokeWidth="0.5" opacity="0.5" />

      {/* Lower back */}
      <path d="M 38,88 Q 50,92 62,88 L 62,108 Q 50,112 38,108 Z"
        fill={f("lower back")} opacity={o("lower back")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Triceps */}
      <path d="M 8,56 Q 4,72 6,88 Q 14,90 18,88 Q 20,72 16,56 Z"
        fill={f("triceps")} opacity={o("triceps")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 92,56 Q 96,72 94,88 Q 86,90 82,88 Q 80,72 84,56 Z"
        fill={f("triceps")} opacity={o("triceps")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Forearms */}
      <path d="M 4,90 Q 0,106 2,120 Q 8,122 14,120 Q 18,106 16,90 Z"
        fill={f("forearms")} opacity={o("forearms")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 96,90 Q 100,106 98,120 Q 92,122 86,120 Q 82,106 84,90 Z"
        fill={f("forearms")} opacity={o("forearms")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Glutes */}
      <path d="M 32,108 Q 40,106 48,108 Q 50,120 48,132 Q 40,134 32,132 Q 30,120 32,108 Z"
        fill={f("glutes")} opacity={o("glutes")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 52,108 Q 60,106 68,108 Q 70,120 68,132 Q 60,134 52,132 Q 50,120 52,108 Z"
        fill={f("glutes")} opacity={o("glutes")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Abductors (outer thigh) */}
      <path d="M 28,132 L 32,132 L 30,162 L 26,162 Z"
        fill={f("abductors")} opacity={o("abductors")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 68,132 L 72,132 L 74,162 L 70,162 Z"
        fill={f("abductors")} opacity={o("abductors")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Hamstrings */}
      <path d="M 32,134 Q 30,150 32,166 Q 40,168 48,166 Q 50,150 48,134 Z"
        fill={f("hamstrings")} opacity={o("hamstrings")} stroke={BASE_STROKE} strokeWidth="0.7" />
      <path d="M 52,134 Q 50,150 52,166 Q 60,168 68,166 Q 70,150 68,134 Z"
        fill={f("hamstrings")} opacity={o("hamstrings")} stroke={BASE_STROKE} strokeWidth="0.7" />

      {/* Calves */}
      <path d="M 32,170 Q 30,188 32,206 Q 38,208 44,206 Q 46,188 44,170 Z"
        fill={f("calves")} opacity={o("calves")} stroke={BASE_STROKE} strokeWidth="0.5" />
      <path d="M 56,170 Q 54,188 56,206 Q 62,208 68,206 Q 70,188 68,170 Z"
        fill={f("calves")} opacity={o("calves")} stroke={BASE_STROKE} strokeWidth="0.5" />

      {/* Feet */}
      <path d="M 30,208 Q 30,214 38,214 L 44,214 Q 46,208 44,206" fill="none" stroke={OUTLINE_STROKE} strokeWidth="0.7" />
      <path d="M 56,208 Q 54,214 62,214 L 68,214 Q 70,208 68,206" fill="none" stroke={OUTLINE_STROKE} strokeWidth="0.7" />
    </g>
  );
}

export function MuscleSvg({ highlight, size = 60 }: MuscleSvgProps) {
  const back = isBackView(highlight);
  const aspect = 220 / 200; // height / width roughly
  const width = size;
  const height = Math.round(size * aspect);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 224"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {back ? <BackBody highlight={highlight} /> : <FrontBody highlight={highlight} />}
    </svg>
  );
}
