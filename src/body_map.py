"""SVG body map for muscle recovery – anatomical style matching references/gym.jpg."""
from src.i18n import t


def render_muscle_map(recovery: dict) -> str:
    """Return HTML with detailed SVG body map colored by recovery status.

    Recovered muscles show as gray outlines only (anatomical diagram).
    Recovering muscles get bright color fills behind the outlines.
    """
    DK = "#0f172a"
    LN = "#4a5568"       # main outline stroke
    LN2 = "#374151"      # inner detail lines (darker)

    def _fill(muscle: str) -> str:
        info = recovery.get(muscle, {})
        s = info.get("status", "recovered")
        if s == "red":    return "#ef4444"
        if s == "orange": return "#f97316"
        if s == "green":  return "#eab308"
        return "none"

    def _opacity(muscle: str) -> str:
        info = recovery.get(muscle, {})
        return "0" if info.get("status", "recovered") == "recovered" else "0.88"

    # ── shortcuts ──
    f = {m: _fill(m) for m in (
        "chest", "back", "shoulders", "biceps", "triceps",
        "core", "quads", "hamstrings", "glutes", "calves", "traps",
    )}
    o = {m: _opacity(m) for m in f}

    # Hours text for legend chips
    def _hrs(m):
        info = recovery.get(m, {})
        h = info.get("hours_since")
        if h is None: return ""
        if info.get("status") == "recovered": return ""
        return f" · {h}h"

    # viewBox 600×540, front cx=152, back cx=448
    CX = 152      # front center
    BX = 296       # back offset (back cx = CX + BX = 448)
    SW = "1.2"     # main stroke width
    SW2 = "0.8"    # detail line stroke width
    MSW = "0.9"    # muscle shape stroke width

    svg = f'''<svg viewBox="0 0 600 540" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;max-width:640px;background:{DK};border-radius:16px;
         display:block;margin:0 auto;padding:8px 0">
<defs>
  <filter id="mg"><feGaussianBlur stdDeviation="2.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<!-- labels -->
<text x="{CX}" y="18" text-anchor="middle" fill="{LN}" font-size="10"
  font-family="system-ui,sans-serif" font-weight="700" letter-spacing="2">FRONT</text>
<text x="{CX+BX}" y="18" text-anchor="middle" fill="{LN}" font-size="10"
  font-family="system-ui,sans-serif" font-weight="700" letter-spacing="2">BACK</text>
<line x1="300" y1="14" x2="300" y2="520" stroke="{LN}" stroke-width="0.5"
  stroke-dasharray="4,4" opacity="0.25"/>

<!-- ══════════════════════ FRONT ══════════════════════ -->
<g id="front">

<!-- ── body silhouette (base) ── -->
<path d="M 80,100 Q73,112 62,134 L54,166 L70,172 L72,228
  L70,262 L74,284 L78,330 L76,360 L74,424
  L104,424 L118,330 L128,300 L134,298 L144,424
  L160,424 L170,298 L176,300 L188,330
  L202,424 L230,424 L228,360 L226,330
  L230,284 L234,262 L232,228 L234,172
  L250,166 L242,134 L231,112 L224,100
  Q192,92 152,92 Q112,92 80,100 Z"
  fill="#111827" stroke="{LN}" stroke-width="{SW}" stroke-linejoin="round"/>

<!-- ── head ── -->
<path d="M 152,30 C172,30 180,42 180,56 C180,70 172,82 164,86
  L140,86 C132,82 124,70 124,56 C124,42 132,30 152,30 Z"
  fill="none" stroke="{LN}" stroke-width="{SW}"/>

<!-- ── neck ── -->
<path d="M 140,86 L136,98 L152,104 L168,98 L164,86"
  fill="none" stroke="{LN}" stroke-width="1"/>

<!-- ── trap slope lines ── -->
<path d="M 136,98 C118,102 98,108 80,114" fill="none" stroke="{LN}" stroke-width="{SW2}"/>
<path d="M 168,98 C186,102 206,108 224,114" fill="none" stroke="{LN}" stroke-width="{SW2}"/>

<!-- === FRONT MUSCLE FILLS (under outlines) === -->

<!-- L shoulder/delt -->
<path d="M 84,106 C72,112 60,126 56,142 C52,158 58,168 64,172
  L78,166 C82,154 86,142 90,130 C94,118 92,110 84,106 Z"
  fill="{f['shoulders']}" opacity="{o['shoulders']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- R shoulder/delt -->
<path d="M 220,106 C232,112 244,126 248,142 C252,158 246,168 240,172
  L226,166 C222,154 218,142 214,130 C210,118 212,110 220,106 Z"
  fill="{f['shoulders']}" opacity="{o['shoulders']}" stroke="{LN}" stroke-width="{MSW}"/>

<!-- L pec -->
<path d="M 150,104 L88,110 C80,118 76,136 82,154
  C90,168 120,178 150,172 Z"
  fill="{f['chest']}" opacity="{o['chest']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- R pec -->
<path d="M 154,104 L216,110 C224,118 228,136 222,154
  C214,168 184,178 154,172 Z"
  fill="{f['chest']}" opacity="{o['chest']}" stroke="{LN}" stroke-width="{MSW}"/>

<!-- pec fiber lines -->
<line x1="152" y1="104" x2="152" y2="172" stroke="{LN}" stroke-width="0.6" opacity="0.5"/>
<line x1="96" y1="118" x2="150" y2="130" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="96" y1="136" x2="150" y2="148" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="96" y1="152" x2="150" y2="162" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="208" y1="118" x2="154" y2="130" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="208" y1="136" x2="154" y2="148" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="208" y1="152" x2="154" y2="162" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>

<!-- core / abs -->
<path d="M 110,176 L194,176 L198,220 L200,264 Q186,280 152,280
  Q118,280 104,264 L106,220 Z"
  fill="{f['core']}" opacity="{o['core']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- ab grid lines -->
<line x1="152" y1="176" x2="152" y2="278" stroke="{LN}" stroke-width="0.6" opacity="0.45"/>
<line x1="110" y1="204" x2="194" y2="204" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<line x1="108" y1="232" x2="196" y2="232" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<line x1="106" y1="258" x2="198" y2="258" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>

<!-- L bicep -->
<path d="M 64,174 C58,188 52,208 48,226 L46,236
  L66,232 C70,214 76,196 80,180 L78,172 Z"
  fill="{f['biceps']}" opacity="{o['biceps']}" stroke="{LN}" stroke-width="{MSW}"
  filter="url(#mg)"/>
<!-- R bicep -->
<path d="M 240,174 C246,188 252,208 256,226 L258,236
  L238,232 C234,214 228,196 224,180 L226,172 Z"
  fill="{f['biceps']}" opacity="{o['biceps']}" stroke="{LN}" stroke-width="{MSW}"
  filter="url(#mg)"/>

<!-- bicep detail lines -->
<line x1="56" y1="192" x2="72" y2="208" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="54" y1="210" x2="68" y2="224" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="248" y1="192" x2="232" y2="208" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="250" y1="210" x2="236" y2="224" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>

<!-- L tricep (visible from front, inner arm) -->
<path d="M 78,172 L86,172 L84,224 L78,230 L68,234 L66,232 L70,214 L76,194 Z"
  fill="{f['triceps']}" opacity="{o['triceps']}" stroke="{LN}" stroke-width="0.6"/>
<!-- R tricep (front inner arm) -->
<path d="M 226,172 L218,172 L220,224 L226,230 L236,234 L238,232 L234,214 L228,194 Z"
  fill="{f['triceps']}" opacity="{o['triceps']}" stroke="{LN}" stroke-width="0.6"/>

<!-- forearms (structure only) -->
<path d="M 46,238 C42,258 38,278 36,298 L34,318
  C30,326 28,336 32,344 C36,350 44,348 48,340
  L52,320 C56,298 60,278 64,258 L66,238 Z"
  fill="none" stroke="{LN}" stroke-width="{SW2}"/>
<path d="M 258,238 C262,258 266,278 268,298 L270,318
  C274,326 276,336 272,344 C268,350 260,348 256,340
  L252,320 C248,298 244,278 240,258 L238,238 Z"
  fill="none" stroke="{LN}" stroke-width="{SW2}"/>
<!-- forearm detail lines -->
<path d="M 44,252 C42,268 40,284 38,300" fill="none" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>
<path d="M 56,252 C54,268 52,284 50,300" fill="none" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>
<path d="M 260,252 C262,268 264,284 266,300" fill="none" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>
<path d="M 248,252 C250,268 252,284 254,300" fill="none" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>

<!-- L quad -->
<path d="M 78,286 C74,306 72,336 72,366
  L72,396 L74,424 L108,424 L114,396
  C118,366 120,336 124,306 C128,292 134,286 140,282
  L104,280 C92,282 84,284 78,286 Z"
  fill="{f['quads']}" opacity="{o['quads']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- R quad -->
<path d="M 226,286 C230,306 232,336 232,366
  L232,396 L230,424 L196,424 L190,396
  C186,366 184,336 180,306 C176,292 170,286 164,282
  L200,280 C212,282 220,284 226,286 Z"
  fill="{f['quads']}" opacity="{o['quads']}" stroke="{LN}" stroke-width="{MSW}"/>

<!-- quad detail — separation lines (rectus femoris / vastus) -->
<path d="M 92,290 C88,320 86,360 88,400" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M 108,290 C108,320 108,360 108,400" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M 212,290 C216,320 218,360 216,400" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M 196,290 C196,320 196,360 196,400" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<!-- VMO teardrop -->
<path d="M 116,390 C120,400 122,412 118,420" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 188,390 C184,400 182,412 186,420" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>

<!-- calves (front — tibialis / gastrocnemius peek) -->
<path d="M 76,430 C74,450 74,470 76,490 L78,508
  L106,508 L108,490 C110,470 112,450 112,430 Z"
  fill="{f['calves']}" opacity="{o['calves']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M 192,430 C190,450 190,470 192,490 L194,508
  L222,508 L224,490 C226,470 228,450 228,430 Z"
  fill="{f['calves']}" opacity="{o['calves']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- calf detail -->
<path d="M 86,434 C84,456 84,478 86,500" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>
<path d="M 98,434 C100,456 100,478 98,500" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>
<path d="M 202,434 C200,456 200,478 202,500" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>
<path d="M 214,434 C216,456 216,478 214,500" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>

<!-- obliques / serratus (front sides) -->
<path d="M 90,156 C86,166 84,176 84,186" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 88,164 C84,172 82,182 82,192" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 108,174 C104,188 102,204 102,220" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 214,156 C218,166 220,176 220,186" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 216,164 C220,172 222,182 222,192" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M 196,174 C200,188 202,204 202,220" fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>

<!-- feet -->
<path d="M 76,510 L72,518 L112,518 L110,510" fill="none" stroke="{LN}" stroke-width="0.8"/>
<path d="M 192,510 L190,518 L230,518 L228,510" fill="none" stroke="{LN}" stroke-width="0.8"/>

</g>

<!-- ══════════════════════ BACK ══════════════════════ -->
<g id="back">

<!-- ── body silhouette (base) ── -->
<path d="M {80+BX},100 Q{73+BX},112 {62+BX},134 L{54+BX},166 L{70+BX},172
  L{72+BX},228 L{70+BX},262 L{74+BX},284 L{78+BX},330 L{76+BX},360
  L{74+BX},424 L{104+BX},424 L{118+BX},330 L{128+BX},300 L{134+BX},298
  L{144+BX},424 L{160+BX},424 L{170+BX},298 L{176+BX},300 L{188+BX},330
  L{202+BX},424 L{230+BX},424 L{228+BX},360 L{226+BX},330
  L{230+BX},284 L{234+BX},262 L{232+BX},228 L{234+BX},172
  L{250+BX},166 L{242+BX},134 L{231+BX},112 L{224+BX},100
  Q{192+BX},92 {152+BX},92 Q{112+BX},92 {80+BX},100 Z"
  fill="#111827" stroke="{LN}" stroke-width="{SW}" stroke-linejoin="round"/>

<!-- ── head ── -->
<path d="M {152+BX},30 C{172+BX},30 {180+BX},42 {180+BX},56
  C{180+BX},70 {172+BX},82 {164+BX},86
  L{140+BX},86 C{132+BX},82 {124+BX},70 {124+BX},56
  C{124+BX},42 {132+BX},30 {152+BX},30 Z"
  fill="none" stroke="{LN}" stroke-width="{SW}"/>

<!-- ── neck ── -->
<path d="M {140+BX},86 L{136+BX},98 L{152+BX},104 L{168+BX},98 L{164+BX},86"
  fill="none" stroke="{LN}" stroke-width="1"/>

<!-- === BACK MUSCLE FILLS === -->

<!-- traps -->
<path d="M {152+BX},92 L{86+BX},108 C{82+BX},114 {80+BX},122 {84+BX},132
  Q{116+BX},148 {152+BX},152
  Q{188+BX},148 {220+BX},132
  C{224+BX},122 {222+BX},114 {218+BX},108 Z"
  fill="{f['traps']}" opacity="{o['traps']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- trap detail — diamond fiber lines -->
<line x1="{152+BX}" y1="96" x2="{152+BX}" y2="150" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<line x1="{120+BX}" y1="108" x2="{152+BX}" y2="130" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>
<line x1="{184+BX}" y1="108" x2="{152+BX}" y2="130" stroke="{LN2}" stroke-width="0.4" opacity="0.3"/>

<!-- rear delts -->
<path d="M {84+BX},110 C{72+BX},116 {60+BX},130 {56+BX},146
  C{52+BX},162 {58+BX},170 {64+BX},174
  L{78+BX},168 C{82+BX},156 {86+BX},144 {90+BX},132
  C{94+BX},120 {92+BX},112 {84+BX},110 Z"
  fill="{f['shoulders']}" opacity="{o['shoulders']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M {220+BX},110 C{232+BX},116 {244+BX},130 {248+BX},146
  C{252+BX},162 {246+BX},170 {240+BX},174
  L{226+BX},168 C{222+BX},156 {218+BX},144 {214+BX},132
  C{210+BX},120 {212+BX},112 {220+BX},110 Z"
  fill="{f['shoulders']}" opacity="{o['shoulders']}" stroke="{LN}" stroke-width="{MSW}"/>

<!-- lats -->
<path d="M {150+BX},154 L{88+BX},134
  C{80+BX},140 {76+BX},158 {72+BX},176
  L{72+BX},228 L{74+BX},264
  L{108+BX},268 L{112+BX},248 C{114+BX},228 {120+BX},200 {130+BX},180
  L{150+BX},166 Z"
  fill="{f['back']}" opacity="{o['back']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M {154+BX},154 L{216+BX},134
  C{224+BX},140 {228+BX},158 {232+BX},176
  L{232+BX},228 L{230+BX},264
  L{196+BX},268 L{192+BX},248 C{190+BX},228 {184+BX},200 {174+BX},180
  L{154+BX},166 Z"
  fill="{f['back']}" opacity="{o['back']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- spine line -->
<line x1="{152+BX}" y1="152" x2="{152+BX}" y2="280" stroke="{LN}" stroke-width="0.7" opacity="0.5"/>
<!-- lat detail lines -->
<path d="M {100+BX},142 C{96+BX},170 {90+BX},200 {86+BX},240"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {120+BX},160 C{118+BX},186 {114+BX},212 {112+BX},244"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {204+BX},142 C{208+BX},170 {214+BX},200 {218+BX},240"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {184+BX},160 C{186+BX},186 {190+BX},212 {192+BX},244"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<!-- lower back / erector lines -->
<path d="M {140+BX},200 C{142+BX},224 {144+BX},248 {144+BX},272"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>
<path d="M {164+BX},200 C{162+BX},224 {160+BX},248 {160+BX},272"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.3"/>

<!-- triceps (back, main view) -->
<path d="M {64+BX},176 C{58+BX},192 {52+BX},212 {48+BX},230
  L{46+BX},238 L{66+BX},234
  C{70+BX},216 {76+BX},198 {80+BX},182 L{78+BX},174 Z"
  fill="{f['triceps']}" opacity="{o['triceps']}" stroke="{LN}" stroke-width="{MSW}"
  filter="url(#mg)"/>
<path d="M {240+BX},176 C{246+BX},192 {252+BX},212 {256+BX},230
  L{258+BX},238 L{238+BX},234
  C{234+BX},216 {228+BX},198 {224+BX},182 L{226+BX},174 Z"
  fill="{f['triceps']}" opacity="{o['triceps']}" stroke="{LN}" stroke-width="{MSW}"
  filter="url(#mg)"/>
<!-- tricep detail lines -->
<line x1="{60+BX}" y1="186" x2="{70+BX}" y2="228" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="{72+BX}" y1="182" x2="{68+BX}" y2="230" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="{244+BX}" y1="186" x2="{234+BX}" y2="228" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>
<line x1="{232+BX}" y1="182" x2="{236+BX}" y2="230" stroke="{LN2}" stroke-width="0.4" opacity="0.4"/>

<!-- forearms (structure) -->
<path d="M {46+BX},240 C{42+BX},260 {38+BX},280 {36+BX},300
  L{34+BX},320 C{30+BX},328 {28+BX},338 {32+BX},346
  C{36+BX},352 {44+BX},350 {48+BX},342
  L{52+BX},322 C{56+BX},300 {60+BX},280 {64+BX},260 L{66+BX},240 Z"
  fill="none" stroke="{LN}" stroke-width="{SW2}"/>
<path d="M {258+BX},240 C{262+BX},260 {266+BX},280 {268+BX},300
  L{270+BX},320 C{274+BX},328 {276+BX},338 {272+BX},346
  C{268+BX},352 {260+BX},350 {256+BX},342
  L{252+BX},322 C{248+BX},300 {244+BX},280 {240+BX},260 L{238+BX},240 Z"
  fill="none" stroke="{LN}" stroke-width="{SW2}"/>

<!-- glutes -->
<path d="M {76+BX},270 C{74+BX},284 {72+BX},300 {76+BX},318
  Q{100+BX},336 {150+BX},332
  L{150+BX},272 L{108+BX},270 Z"
  fill="{f['glutes']}" opacity="{o['glutes']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M {228+BX},270 C{230+BX},284 {232+BX},300 {228+BX},318
  Q{204+BX},336 {154+BX},332
  L{154+BX},272 L{196+BX},270 Z"
  fill="{f['glutes']}" opacity="{o['glutes']}" stroke="{LN}" stroke-width="{MSW}"/>
<line x1="{152+BX}" y1="272" x2="{152+BX}" y2="330" stroke="{LN}" stroke-width="0.5" opacity="0.4"/>
<!-- glute detail -->
<path d="M {100+BX},278 C{96+BX},296 {96+BX},314 {110+BX},326"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {204+BX},278 C{208+BX},296 {208+BX},314 {194+BX},326"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>

<!-- hamstrings -->
<path d="M {78+BX},322 C{76+BX},350 {74+BX},380 {74+BX},410
  L{76+BX},424 L{110+BX},424 L{114+BX},396
  C{118+BX},368 {122+BX},340 {128+BX},322
  L{134+BX},316 L{104+BX},320 Z"
  fill="{f['hamstrings']}" opacity="{o['hamstrings']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M {226+BX},322 C{228+BX},350 {230+BX},380 {230+BX},410
  L{228+BX},424 L{194+BX},424 L{190+BX},396
  C{186+BX},368 {182+BX},340 {176+BX},322
  L{170+BX},316 L{200+BX},320 Z"
  fill="{f['hamstrings']}" opacity="{o['hamstrings']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- hamstring detail — biceps femoris / semitendinosus separation -->
<path d="M {96+BX},326 C{94+BX},356 {92+BX},386 {92+BX},416"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M {114+BX},330 C{114+BX},360 {112+BX},390 {112+BX},420"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M {208+BX},326 C{210+BX},356 {212+BX},386 {212+BX},416"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>
<path d="M {190+BX},330 C{190+BX},360 {192+BX},390 {192+BX},420"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.4"/>

<!-- calves (back — gastrocnemius) -->
<path d="M {76+BX},430 C{72+BX},450 {70+BX},470 {72+BX},490
  L{76+BX},508 L{108+BX},508 L{112+BX},490
  C{114+BX},470 {114+BX},450 {112+BX},430 Z"
  fill="{f['calves']}" opacity="{o['calves']}" stroke="{LN}" stroke-width="{MSW}"/>
<path d="M {192+BX},430 C{190+BX},450 {188+BX},470 {190+BX},490
  L{192+BX},508 L{226+BX},508 L{228+BX},490
  C{230+BX},470 {232+BX},450 {230+BX},430 Z"
  fill="{f['calves']}" opacity="{o['calves']}" stroke="{LN}" stroke-width="{MSW}"/>
<!-- calf detail — gastrocnemius heads -->
<path d="M {88+BX},434 C{86+BX},456 {84+BX},478 {88+BX},500"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {98+BX},434 C{100+BX},456 {100+BX},478 {98+BX},500"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {206+BX},434 C{204+BX},456 {202+BX},478 {206+BX},500"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>
<path d="M {216+BX},434 C{218+BX},456 {218+BX},478 {216+BX},500"
  fill="none" stroke="{LN2}" stroke-width="0.5" opacity="0.35"/>

<!-- feet -->
<path d="M {76+BX},510 L{72+BX},518 L{112+BX},518 L{110+BX},510"
  fill="none" stroke="{LN}" stroke-width="0.8"/>
<path d="M {192+BX},510 L{190+BX},518 L{230+BX},518 L{228+BX},510"
  fill="none" stroke="{LN}" stroke-width="0.8"/>

</g>
</svg>'''

    # ── legend ──
    legend_items = [
        ("#ef4444", t("gym.recovery_training")),
        ("#f97316", t("gym.recovery_recovering")),
        ("#eab308", t("gym.recovery_almost_ready")),
        ("#1e3a5f", t("gym.recovery_recovered")),
    ]
    leg = '<div style="display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 6px;padding:0 4px">'
    for col, label in legend_items:
        leg += (
            f'<div style="display:flex;align-items:center;gap:6px">'
            f'<div style="width:14px;height:14px;border-radius:3px;background:{col};'
            f'border:1px solid rgba(255,255,255,0.1)"></div>'
            f'<span style="color:#94a3b8;font-size:0.76rem">{label}</span></div>'
        )
    leg += '</div>'

    # ── status chips ──
    chip_order = ["chest", "back", "shoulders", "biceps", "triceps",
                  "core", "traps", "quads", "hamstrings", "glutes", "calves"]
    chips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'
    for mg in chip_order:
        inf = recovery.get(mg, {})
        st = inf.get("status", "recovered")
        lbl = inf.get("label", mg.title())
        hrs = inf.get("hours_since")
        if st == "red":      bg, tc = "rgba(239,68,68,0.18)",  "#ef4444"
        elif st == "orange": bg, tc = "rgba(249,115,22,0.18)", "#f97316"
        elif st == "green":  bg, tc = "rgba(234,179,8,0.18)",  "#eab308"
        else:                bg, tc = "rgba(255,255,255,0.05)", "#64748b"
        sub = f" · {hrs}h" if hrs else ""
        chips += (
            f'<div style="background:{bg};border:1px solid {tc}33;border-radius:20px;'
            f'padding:3px 10px;font-size:0.74rem;color:{tc};white-space:nowrap">'
            f'{lbl}{sub}</div>'
        )
    chips += '</div>'

    return leg + chips
