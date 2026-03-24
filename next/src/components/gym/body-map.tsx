"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

type MuscleGroup = {
  name: string;
  lastWorked: string | null;
};

type RecoveryStatus = "red" | "orange" | "green" | "gray";

function getRecoveryStatus(lastWorked: string | null): RecoveryStatus {
  if (!lastWorked) return "gray";
  const now = Date.now();
  const worked = new Date(lastWorked + "T12:00:00").getTime();
  const hoursSince = (now - worked) / (1000 * 60 * 60);
  if (hoursSince < 24) return "red";
  if (hoursSince < 48) return "orange";
  if (hoursSince < 72) return "green";
  return "gray";
}

function getStatusColor(status: RecoveryStatus): string {
  switch (status) {
    case "red": return "#ef4444";
    case "orange": return "#f97316";
    case "green": return "#22c55e";
    case "gray": return "currentColor";
  }
}

function getStatusOpacity(status: RecoveryStatus): number {
  switch (status) {
    case "red": return 0.82;
    case "orange": return 0.75;
    case "green": return 0.68;
    case "gray": return 0.06;
  }
}

function getHoursSince(lastWorked: string | null): number | null {
  if (!lastWorked) return null;
  const now = Date.now();
  const worked = new Date(lastWorked + "T12:00:00").getTime();
  return Math.round((now - worked) / (1000 * 60 * 60));
}

export function BodyMap({ muscleGroups }: { muscleGroups: MuscleGroup[] }) {
  const t = useTranslations("gym");

  const LEGEND: { status: RecoveryStatus; label: string; color: string }[] = [
    { status: "red", label: t("recovery_training"), color: "#ef4444" },
    { status: "orange", label: t("recovery_recovering"), color: "#f97316" },
    { status: "green", label: t("recovery_almost_ready"), color: "#22c55e" },
    { status: "gray", label: t("recovery_recovered"), color: "#6b7280" },
  ];

  const statusMap = useMemo(() => {
    const map: Record<string, { status: RecoveryStatus; color: string; opacity: number; hours: number | null }> = {};
    for (const mg of muscleGroups) {
      const status = getRecoveryStatus(mg.lastWorked);
      map[mg.name.toLowerCase()] = {
        status,
        color: getStatusColor(status),
        opacity: getStatusOpacity(status),
        hours: getHoursSince(mg.lastWorked),
      };
    }
    return map;
  }, [muscleGroups]);

  const m = (name: string) =>
    statusMap[name] ?? { status: "gray" as RecoveryStatus, color: "currentColor", opacity: 0.06, hours: null };

  const chipOrder = ["chest", "back", "shoulders", "biceps", "triceps",
    "core", "traps", "quads", "hamstrings", "glutes", "calves"];

  // Shared stroke classes
  const outline = "stroke-muted-foreground/50";
  const detail = "stroke-muted-foreground/20";
  const fineDetail = "stroke-muted-foreground/15";

  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 520 700"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[560px] mx-auto block rounded-2xl bg-card border border-border"
        style={{ padding: "12px 0" }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle inner shadow for depth */}
          <filter id="inset">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feOffset dx="0" dy="1" result="offsetBlur" />
            <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
          </filter>
        </defs>

        {/* Labels */}
        <text x="130" y="22" textAnchor="middle" className="fill-muted-foreground" fontSize="11" fontFamily="Inter,system-ui,sans-serif" fontWeight="700" letterSpacing="3">
          FRONT
        </text>
        <text x="390" y="22" textAnchor="middle" className="fill-muted-foreground" fontSize="11" fontFamily="Inter,system-ui,sans-serif" fontWeight="700" letterSpacing="3">
          BACK
        </text>
        <line x1="260" y1="18" x2="260" y2="680" className="stroke-muted-foreground/15" strokeWidth="0.5" strokeDasharray="6,4" />

        {/* ==================== FRONT ==================== */}
        <g id="front" transform="translate(130, 350)" className={outline}>

          {/* --- Head --- */}
          <ellipse cx="0" cy="-298" rx="22" ry="28" fill="none" strokeWidth="1.1" className={outline} />
          {/* Ears */}
          <path d="M -22,-302 C-26,-308 -26,-290 -22,-294" fill="none" strokeWidth="0.8" className={detail} />
          <path d="M 22,-302 C26,-308 26,-290 22,-294" fill="none" strokeWidth="0.8" className={detail} />

          {/* --- Neck --- */}
          <path d="M -10,-270 L-12,-254 M 10,-270 L12,-254" fill="none" strokeWidth="1" className={outline} />

          {/* --- Trapezius (front visible) --- */}
          <path
            d="M -12,-256 C-28,-250 -52,-240 -62,-232 L-52,-224 C-38,-232 -20,-242 -8,-248 Z"
            fill={m("traps").color} opacity={m("traps").opacity} strokeWidth="0.7" className={outline}
          />
          <path
            d="M 12,-256 C28,-250 52,-240 62,-232 L52,-224 C38,-232 20,-242 8,-248 Z"
            fill={m("traps").color} opacity={m("traps").opacity} strokeWidth="0.7" className={outline}
          />

          {/* --- Shoulders / Deltoids --- */}
          {/* L delt */}
          <path
            d="M -56,-230 C-72,-224 -84,-208 -88,-188 C-90,-174 -86,-162 -78,-156 L-68,-160 C-64,-174 -60,-190 -58,-206 C-56,-218 -56,-226 -56,-230 Z"
            fill={m("shoulders").color} opacity={m("shoulders").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R delt */}
          <path
            d="M 56,-230 C72,-224 84,-208 88,-188 C90,-174 86,-162 78,-156 L68,-160 C64,-174 60,-190 58,-206 C56,-218 56,-226 56,-230 Z"
            fill={m("shoulders").color} opacity={m("shoulders").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Delt separation lines (3 heads) */}
          <path d="M -64,-222 C-72,-206 -80,-188 -82,-170" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M -58,-224 C-62,-206 -68,-188 -72,-168" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 64,-222 C72,-206 80,-188 82,-170" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 58,-224 C62,-206 68,-188 72,-168" fill="none" strokeWidth="0.5" className={detail} />

          {/* --- Chest / Pectorals --- */}
          {/* L pec */}
          <path
            d="M -4,-244 C-24,-238 -52,-228 -56,-226 C-62,-218 -66,-198 -62,-180 C-56,-164 -34,-154 -4,-160 Z"
            fill={m("chest").color} opacity={m("chest").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R pec */}
          <path
            d="M 4,-244 C24,-238 52,-228 56,-226 C62,-218 66,-198 62,-180 C56,-164 34,-154 4,-160 Z"
            fill={m("chest").color} opacity={m("chest").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Pec center line (sternum) */}
          <line x1="0" y1="-244" x2="0" y2="-158" strokeWidth="0.6" className="stroke-muted-foreground/30" />
          {/* Pec fiber lines (fan pattern) */}
          <path d="M -50,-220 C-36,-218 -18,-212 -4,-206" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M -56,-200 C-40,-196 -22,-190 -4,-184" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M -50,-180 C-34,-176 -18,-170 -4,-168" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 50,-220 C36,-218 18,-212 4,-206" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 56,-200 C40,-196 22,-190 4,-184" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 50,-180 C34,-176 18,-170 4,-168" fill="none" strokeWidth="0.4" className={fineDetail} />

          {/* --- Core / Abdominals --- */}
          <path
            d="M -36,-156 L36,-156 C40,-140 42,-120 42,-100 C42,-78 38,-56 30,-40 Q16,-30 0,-28 Q-16,-30 -30,-40 C-38,-56 -42,-78 -42,-100 C-42,-120 -40,-140 -36,-156 Z"
            fill={m("core").color} opacity={m("core").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Linea alba (center line) */}
          <line x1="0" y1="-156" x2="0" y2="-30" strokeWidth="0.6" className="stroke-muted-foreground/25" />
          {/* Ab pack horizontal lines (6-pack) */}
          <line x1="-30" y1="-136" x2="30" y2="-136" strokeWidth="0.4" className={detail} />
          <line x1="-32" y1="-112" x2="32" y2="-112" strokeWidth="0.4" className={detail} />
          <line x1="-34" y1="-88" x2="34" y2="-88" strokeWidth="0.4" className={detail} />
          <line x1="-32" y1="-64" x2="32" y2="-64" strokeWidth="0.4" className={detail} />

          {/* Oblique / serratus lines */}
          <path d="M -42,-148 C-46,-136 -48,-122 -48,-108" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -44,-132 C-48,-120 -50,-106 -50,-92" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -46,-116 C-50,-104 -52,-90 -52,-76" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 42,-148 C46,-136 48,-122 48,-108" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 44,-132 C48,-120 50,-106 50,-92" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 46,-116 C50,-104 52,-90 52,-76" fill="none" strokeWidth="0.4" className={detail} />

          {/* --- Biceps --- */}
          {/* L bicep */}
          <path
            d="M -70,-154 C-76,-138 -82,-118 -86,-98 L-88,-86 C-84,-84 -74,-82 -70,-84 C-68,-100 -64,-120 -62,-140 L-64,-152 Z"
            fill={m("biceps").color} opacity={m("biceps").opacity} strokeWidth="0.9" className={outline}
            filter="url(#glow)"
          />
          {/* R bicep */}
          <path
            d="M 70,-154 C76,-138 82,-118 86,-98 L88,-86 C84,-84 74,-82 70,-84 C68,-100 64,-120 62,-140 L64,-152 Z"
            fill={m("biceps").color} opacity={m("biceps").opacity} strokeWidth="0.9" className={outline}
            filter="url(#glow)"
          />
          {/* Bicep peak detail */}
          <path d="M -78,-128 C-74,-118 -72,-108 -74,-96" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 78,-128 C74,-118 72,-108 74,-96" fill="none" strokeWidth="0.4" className={detail} />

          {/* --- Triceps (inner arm, front view) --- */}
          <path
            d="M -64,-152 L-58,-154 C-56,-134 -56,-114 -58,-94 L-64,-88 L-70,-84 C-68,-106 -66,-128 -64,-152 Z"
            fill={m("triceps").color} opacity={m("triceps").opacity} strokeWidth="0.6" className={detail}
          />
          <path
            d="M 64,-152 L58,-154 C56,-134 56,-114 58,-94 L64,-88 L70,-84 C68,-106 66,-128 64,-152 Z"
            fill={m("triceps").color} opacity={m("triceps").opacity} strokeWidth="0.6" className={detail}
          />

          {/* --- Forearms (outline only) --- */}
          <path
            d="M -88,-82 C-92,-60 -96,-38 -98,-16 L-100,4 C-104,14 -106,24 -102,34 C-98,40 -90,38 -86,30 L-82,10 C-78,-12 -74,-36 -70,-58 L-70,-80 Z"
            fill="none" strokeWidth="0.8" className={outline}
          />
          <path
            d="M 88,-82 C92,-60 96,-38 98,-16 L100,4 C104,14 106,24 102,34 C98,40 90,38 86,30 L82,10 C78,-12 74,-36 70,-58 L70,-80 Z"
            fill="none" strokeWidth="0.8" className={outline}
          />
          {/* Forearm detail */}
          <path d="M -90,-68 C-92,-48 -94,-28 -96,-8" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M -80,-68 C-82,-48 -84,-28 -86,-8" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 90,-68 C92,-48 94,-28 96,-8" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 80,-68 C82,-48 84,-28 86,-8" fill="none" strokeWidth="0.4" className={fineDetail} />

          {/* --- Quadriceps --- */}
          {/* L quad */}
          <path
            d="M -30,-36 C-38,-28 -46,-16 -50,4 C-54,28 -56,60 -56,92 L-56,120 L-54,156 L-28,156 L-22,120 C-20,92 -18,64 -14,36 C-10,16 -4,-4 2,-22 L-16,-30 C-22,-32 -26,-34 -30,-36 Z"
            fill={m("quads").color} opacity={m("quads").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R quad */}
          <path
            d="M 30,-36 C38,-28 46,-16 50,4 C54,28 56,60 56,92 L56,120 L54,156 L28,156 L22,120 C20,92 18,64 14,36 C10,16 4,-4 -2,-22 L16,-30 C22,-32 26,-34 30,-36 Z"
            fill={m("quads").color} opacity={m("quads").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Quad separation lines (rectus femoris / vastus) */}
          <path d="M -40,-18 C-44,12 -46,52 -46,92" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M -28,-24 C-28,8 -28,48 -30,88" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 40,-18 C44,12 46,52 46,92" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 28,-24 C28,8 28,48 30,88" fill="none" strokeWidth="0.5" className={detail} />
          {/* VMO teardrop */}
          <path d="M -24,130 C-22,140 -22,148 -26,154" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 24,130 C22,140 22,148 26,154" fill="none" strokeWidth="0.5" className={detail} />

          {/* Inner thigh gap */}
          <path d="M -8,-26 C-6,0 -4,30 -4,60 L-2,100" fill="none" strokeWidth="0.6" className={detail} />
          <path d="M 8,-26 C6,0 4,30 4,60 L2,100" fill="none" strokeWidth="0.6" className={detail} />

          {/* --- Knee area --- */}
          <path d="M -50,156 C-46,164 -34,168 -26,164 L-22,156" fill="none" strokeWidth="0.6" className={detail} />
          <path d="M 50,156 C46,164 34,168 26,164 L22,156" fill="none" strokeWidth="0.6" className={detail} />

          {/* --- Calves (front - tibialis) --- */}
          <path
            d="M -50,164 C-52,188 -52,212 -50,236 L-48,260 L-28,260 L-26,236 C-24,212 -22,188 -22,164 Z"
            fill={m("calves").color} opacity={m("calves").opacity} strokeWidth="0.9" className={outline}
          />
          <path
            d="M 50,164 C52,188 52,212 50,236 L48,260 L28,260 L26,236 C24,212 22,188 22,164 Z"
            fill={m("calves").color} opacity={m("calves").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Calf detail (tibialis / gastrocnemius) */}
          <path d="M -40,170 C-42,194 -42,218 -40,242" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M -32,170 C-32,194 -32,218 -32,242" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 40,170 C42,194 42,218 40,242" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 32,170 C32,194 32,218 32,242" fill="none" strokeWidth="0.4" className={fineDetail} />

          {/* --- Feet --- */}
          <path d="M -50,262 C-52,268 -52,274 -44,276 L-24,276 C-20,274 -22,268 -26,262" fill="none" strokeWidth="0.7" className={outline} />
          <path d="M 50,262 C52,268 52,274 44,276 L24,276 C20,274 22,268 26,262" fill="none" strokeWidth="0.7" className={outline} />

          {/* --- Body outline (subtle silhouette) --- */}
          <path
            d="M -56,-230 C-62,-218 -66,-198 -68,-160 L-70,-154 L-88,-82 L-100,4 C-104,14 -106,24 -102,34 M -68,-160 L-64,-152 L-58,-154 C-56,-148 -48,-142 -42,-136 L-42,-100 C-42,-78 -44,-56 -48,-36 L-56,28 L-56,156 L-50,164 C-52,212 -50,240 -48,260"
            fill="none" strokeWidth="0" className={fineDetail}
          />
        </g>

        {/* ==================== BACK ==================== */}
        <g id="back" transform="translate(390, 350)" className={outline}>

          {/* --- Head --- */}
          <ellipse cx="0" cy="-298" rx="22" ry="28" fill="none" strokeWidth="1.1" className={outline} />
          <path d="M -22,-302 C-26,-308 -26,-290 -22,-294" fill="none" strokeWidth="0.8" className={detail} />
          <path d="M 22,-302 C26,-308 26,-290 22,-294" fill="none" strokeWidth="0.8" className={detail} />

          {/* --- Neck --- */}
          <path d="M -10,-270 L-12,-254 M 10,-270 L12,-254" fill="none" strokeWidth="1" className={outline} />

          {/* --- Trapezius (full diamond) --- */}
          <path
            d="M 0,-256 L-58,-228 C-54,-218 -48,-210 -40,-204 Q-20,-192 0,-188 Q20,-192 40,-204 C48,-210 54,-218 58,-228 Z"
            fill={m("traps").color} opacity={m("traps").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Trap fiber lines */}
          <line x1="0" y1="-254" x2="0" y2="-190" strokeWidth="0.5" className="stroke-muted-foreground/25" />
          <path d="M -30,-240 C-18,-228 -6,-216 0,-210" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 30,-240 C18,-228 6,-216 0,-210" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M -44,-228 C-30,-218 -14,-208 0,-200" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 44,-228 C30,-218 14,-208 0,-200" fill="none" strokeWidth="0.4" className={fineDetail} />

          {/* --- Rear Deltoids --- */}
          <path
            d="M -56,-230 C-72,-224 -84,-208 -88,-188 C-90,-174 -86,-162 -78,-156 L-68,-160 C-64,-174 -62,-192 -60,-210 C-58,-220 -56,-228 -56,-230 Z"
            fill={m("shoulders").color} opacity={m("shoulders").opacity} strokeWidth="0.9" className={outline}
          />
          <path
            d="M 56,-230 C72,-224 84,-208 88,-188 C90,-174 86,-162 78,-156 L68,-160 C64,-174 62,-192 60,-210 C58,-220 56,-228 56,-230 Z"
            fill={m("shoulders").color} opacity={m("shoulders").opacity} strokeWidth="0.9" className={outline}
          />

          {/* --- Lats / Back --- */}
          {/* L lat */}
          <path
            d="M -2,-188 L-52,-210 C-58,-200 -62,-182 -64,-162 L-66,-120 L-64,-78 L-38,-72 C-34,-92 -28,-116 -20,-140 L-2,-170 Z"
            fill={m("back").color} opacity={m("back").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R lat */}
          <path
            d="M 2,-188 L52,-210 C58,-200 62,-182 64,-162 L66,-120 L64,-78 L38,-72 C34,-92 28,-116 20,-140 L2,-170 Z"
            fill={m("back").color} opacity={m("back").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Spine line */}
          <line x1="0" y1="-188" x2="0" y2="-36" strokeWidth="0.7" className="stroke-muted-foreground/30" />
          {/* Lat detail lines */}
          <path d="M -48,-198 C-52,-178 -56,-148 -58,-118" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -36,-186 C-38,-162 -42,-136 -44,-106" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -22,-172 C-24,-150 -28,-126 -32,-98" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 48,-198 C52,-178 56,-148 58,-118" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 36,-186 C38,-162 42,-136 44,-106" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 22,-172 C24,-150 28,-126 32,-98" fill="none" strokeWidth="0.4" className={detail} />

          {/* Lower back / erector spinae */}
          <path d="M -12,-140 C-14,-116 -16,-92 -16,-68" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 12,-140 C14,-116 16,-92 16,-68" fill="none" strokeWidth="0.5" className={detail} />
          {/* Teres major lines */}
          <path d="M -56,-180 C-48,-172 -36,-168 -24,-170" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 56,-180 C48,-172 36,-168 24,-170" fill="none" strokeWidth="0.4" className={detail} />

          {/* --- Triceps (back view, main) --- */}
          <path
            d="M -68,-156 C-74,-138 -80,-116 -84,-96 L-86,-84 C-82,-82 -74,-80 -70,-82 L-68,-96 C-66,-116 -64,-136 -64,-152 Z"
            fill={m("triceps").color} opacity={m("triceps").opacity} strokeWidth="0.9" className={outline}
            filter="url(#glow)"
          />
          <path
            d="M 68,-156 C74,-138 80,-116 84,-96 L86,-84 C82,-82 74,-80 70,-82 L68,-96 C66,-116 64,-136 64,-152 Z"
            fill={m("triceps").color} opacity={m("triceps").opacity} strokeWidth="0.9" className={outline}
            filter="url(#glow)"
          />
          {/* Tricep horseshoe detail */}
          <path d="M -72,-142 C-76,-124 -78,-106 -80,-92" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -66,-146 C-68,-128 -70,-110 -72,-94" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 72,-142 C76,-124 78,-106 80,-92" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 66,-146 C68,-128 70,-110 72,-94" fill="none" strokeWidth="0.4" className={detail} />

          {/* --- Forearms --- */}
          <path
            d="M -86,-80 C-90,-58 -94,-36 -96,-14 L-98,6 C-102,16 -104,26 -100,36 C-96,42 -88,40 -84,32 L-80,12 C-76,-10 -72,-34 -68,-56 L-70,-78 Z"
            fill="none" strokeWidth="0.8" className={outline}
          />
          <path
            d="M 86,-80 C90,-58 94,-36 96,-14 L98,6 C102,16 104,26 100,36 C96,42 88,40 84,32 L80,12 C76,-10 72,-34 68,-56 L70,-78 Z"
            fill="none" strokeWidth="0.8" className={outline}
          />

          {/* --- Glutes --- */}
          {/* L glute */}
          <path
            d="M -32,-68 C-38,-56 -44,-40 -46,-22 C-48,-4 -42,12 -30,20 Q-16,28 -2,24 L-2,-68 Z"
            fill={m("glutes").color} opacity={m("glutes").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R glute */}
          <path
            d="M 32,-68 C38,-56 44,-40 46,-22 C48,-4 42,12 30,20 Q16,28 2,24 L2,-68 Z"
            fill={m("glutes").color} opacity={m("glutes").opacity} strokeWidth="0.9" className={outline}
          />
          <line x1="0" y1="-68" x2="0" y2="22" strokeWidth="0.5" className="stroke-muted-foreground/20" />
          {/* Glute detail */}
          <path d="M -36,-52 C-40,-34 -40,-14 -28,8" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 36,-52 C40,-34 40,-14 28,8" fill="none" strokeWidth="0.4" className={detail} />

          {/* --- Hamstrings --- */}
          {/* L hamstring */}
          <path
            d="M -46,14 C-50,38 -52,68 -52,98 L-52,124 L-50,156 L-28,156 L-24,124 C-22,96 -20,68 -16,40 C-12,22 -6,10 0,2 L-18,-2 C-30,0 -40,6 -46,14 Z"
            fill={m("hamstrings").color} opacity={m("hamstrings").opacity} strokeWidth="0.9" className={outline}
          />
          {/* R hamstring */}
          <path
            d="M 46,14 C50,38 52,68 52,98 L52,124 L50,156 L28,156 L24,124 C22,96 20,68 16,40 C12,22 6,10 0,2 L18,-2 C30,0 40,6 46,14 Z"
            fill={m("hamstrings").color} opacity={m("hamstrings").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Hamstring detail (biceps femoris / semitendinosus) */}
          <path d="M -40,20 C-42,50 -44,80 -44,110" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M -28,18 C-28,48 -28,78 -30,108" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 40,20 C42,50 44,80 44,110" fill="none" strokeWidth="0.5" className={detail} />
          <path d="M 28,18 C28,48 28,78 30,108" fill="none" strokeWidth="0.5" className={detail} />

          {/* --- Knee area --- */}
          <path d="M -50,156 C-46,164 -34,168 -26,164 L-22,156" fill="none" strokeWidth="0.6" className={detail} />
          <path d="M 50,156 C46,164 34,168 26,164 L22,156" fill="none" strokeWidth="0.6" className={detail} />

          {/* --- Calves (back - gastrocnemius) --- */}
          <path
            d="M -50,164 C-54,184 -54,208 -52,232 L-48,260 L-28,260 L-26,232 C-22,208 -20,184 -22,164 Z"
            fill={m("calves").color} opacity={m("calves").opacity} strokeWidth="0.9" className={outline}
          />
          <path
            d="M 50,164 C54,184 54,208 52,232 L48,260 L28,260 L26,232 C22,208 20,184 22,164 Z"
            fill={m("calves").color} opacity={m("calves").opacity} strokeWidth="0.9" className={outline}
          />
          {/* Gastrocnemius heads */}
          <path d="M -42,168 C-44,192 -44,216 -42,240" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M -32,168 C-32,192 -32,216 -32,240" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 42,168 C44,192 44,216 42,240" fill="none" strokeWidth="0.4" className={detail} />
          <path d="M 32,168 C32,192 32,216 32,240" fill="none" strokeWidth="0.4" className={detail} />
          {/* Achilles tendon */}
          <path d="M -40,248 C-38,256 -36,260 -38,264" fill="none" strokeWidth="0.4" className={fineDetail} />
          <path d="M 40,248 C38,256 36,260 38,264" fill="none" strokeWidth="0.4" className={fineDetail} />

          {/* --- Feet --- */}
          <path d="M -50,262 C-52,268 -52,274 -44,276 L-24,276 C-20,274 -22,268 -26,262" fill="none" strokeWidth="0.7" className={outline} />
          <path d="M 50,262 C52,268 52,274 44,276 L24,276 C20,274 22,268 26,262" fill="none" strokeWidth="0.7" className={outline} />
        </g>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap justify-center">
        {LEGEND.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm border border-border"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Muscle status chips */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {chipOrder.map((name) => {
          const mg = muscleGroups.find((g) => g.name.toLowerCase() === name);
          if (!mg) return null;
          const s = m(name);
          const hours = s.hours;
          return (
            <div
              key={name}
              className="text-xs px-2.5 py-1 rounded-full border whitespace-nowrap"
              style={{
                backgroundColor:
                  s.status === "gray" ? "var(--muted)" : `${s.color}18`,
                borderColor:
                  s.status === "gray" ? "var(--border)" : `${s.color}33`,
                color:
                  s.status === "gray" ? "var(--muted-foreground)" : s.color,
              }}
            >
              {mg.name}
              {hours !== null && s.status !== "gray" && ` \u00b7 ${hours}h`}
            </div>
          );
        })}
      </div>
    </div>
  );
}
