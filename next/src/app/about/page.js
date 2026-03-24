"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = AboutPage;
var lucide_react_1 = require("lucide-react");
exports.metadata = {
    title: "About — Personal Dashboard",
    description: "Open-source, self-hosted personal dashboard for finance, health, fitness, investments, trading, and tax reporting.",
};
/* ------------------------------------------------------------------ */
/* Language switcher (client island)                                    */
/* ------------------------------------------------------------------ */
function LangSwitcher() {
    return (<div className="lang-switch" id="langSwitch">
      <button className="lang-btn active" data-lang="en">
        EN
      </button>
      <button className="lang-btn" data-lang="ua">
        UA
      </button>
      <button className="lang-btn" data-lang="es">
        ES
      </button>
    </div>);
}
/* ------------------------------------------------------------------ */
/* Trilingual text helper                                              */
/* ------------------------------------------------------------------ */
function T(_a) {
    var en = _a.en, ua = _a.ua, es = _a.es, _b = _a.as, Tag = _b === void 0 ? "span" : _b, className = _a.className;
    return (
    // @ts-expect-error dynamic tag
    <Tag className={className} data-en={en} data-ua={ua} data-es={es}>
      {en}
    </Tag>);
}
/* ------------------------------------------------------------------ */
/* Feature card                                                        */
/* ------------------------------------------------------------------ */
function FeatureCard(_a) {
    var icon = _a.icon, titleEn = _a.titleEn, titleUa = _a.titleUa, titleEs = _a.titleEs, descEn = _a.descEn, descUa = _a.descUa, descEs = _a.descEs, screenshot = _a.screenshot;
    return (<div className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-[#FFC700]/30 hover:bg-white/[0.04]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFC700]/10 text-[#FFC700]">
        {icon}
      </div>
      <T as="h3" en={titleEn} ua={titleUa} es={titleEs} className="mb-2 text-lg font-semibold text-white"/>
      <T as="p" en={descEn} ua={descUa} es={descEs} className="text-sm leading-relaxed text-[#9a9ea6]"/>
      <div data-screenshot={screenshot} className="mt-4 h-40 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-xs text-[#9a9ea6]/40">
        <T en="Screenshot coming soon" ua="Скриншот скоро" es="Captura pronto"/>
      </div>
    </div>);
}
/* ------------------------------------------------------------------ */
/* Integration badge                                                   */
/* ------------------------------------------------------------------ */
function IntBadge(_a) {
    var name = _a.name;
    return (<span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[#9a9ea6] transition-colors hover:border-[#FFC700]/30 hover:text-white">
      <lucide_react_1.Link2 className="h-3 w-3 text-[#FFC700]/60"/>
      {name}
    </span>);
}
/* ------------------------------------------------------------------ */
/* Tech badge                                                          */
/* ------------------------------------------------------------------ */
function TechBadge(_a) {
    var icon = _a.icon, name = _a.name;
    return (<span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-[#9a9ea6]">
      {icon}
      {name}
    </span>);
}
/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
function AboutPage() {
    return (<>
      {/* Inline script for language switching — must be a client-side script */}
      <script dangerouslySetInnerHTML={{
            __html: "\n(function(){\n  function setLang(lang) {\n    document.querySelectorAll('[data-' + lang + ']').forEach(function(el) {\n      var text = el.getAttribute('data-' + lang);\n      if (text) el.innerHTML = text;\n    });\n    document.querySelectorAll('.lang-btn').forEach(function(btn) {\n      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);\n    });\n    document.documentElement.lang = lang === 'ua' ? 'uk' : lang === 'es' ? 'es' : 'en';\n    localStorage.setItem('pd-about-lang', lang);\n  }\n  document.addEventListener('click', function(e) {\n    var btn = e.target.closest('.lang-btn');\n    if (btn) setLang(btn.getAttribute('data-lang'));\n  });\n  var saved = localStorage.getItem('pd-about-lang');\n  if (saved && saved !== 'en') {\n    if (document.readyState === 'loading') {\n      document.addEventListener('DOMContentLoaded', function() { setLang(saved); });\n    } else { setLang(saved); }\n  }\n})();\n          ",
        }}/>

      <div className="min-h-screen bg-[#26282B] text-white selection:bg-[#FFC700]/20">
        {/* Language Switcher */}
        <LangSwitcher />

        {/* ==================== HERO ==================== */}
        <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 lg:px-8">
          {/* Gradient glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#FFC700]/[0.04] blur-[120px]"/>
          </div>

          <div className="relative mx-auto max-w-4xl text-center">
            {/* Logo */}
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/20">
              <span className="text-3xl font-bold bg-gradient-to-br from-[#FFC700] to-[#FFA800] bg-clip-text text-transparent">
                PD
              </span>
            </div>

            <T as="h1" en="Personal Dashboard" ua="Персональний Дашборд" es="Panel Personal" className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"/>

            <T as="p" en="Your life, your data, your server." ua="Твоє життя, твої дані, твій сервер." es="Tu vida, tus datos, tu servidor." className="mb-8 text-lg text-[#9a9ea6] sm:text-xl"/>

            {/* Badges */}
            <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
              {[
            {
                icon: <lucide_react_1.Github className="h-3.5 w-3.5"/>,
                en: "Open Source",
                ua: "Відкритий код",
                es: "Codigo abierto",
            },
            {
                icon: <lucide_react_1.Server className="h-3.5 w-3.5"/>,
                en: "Self-Hosted",
                ua: "Самохостинг",
                es: "Autoalojado",
            },
            {
                icon: <lucide_react_1.ShieldCheck className="h-3.5 w-3.5"/>,
                en: "Privacy-First",
                ua: "Приватність",
                es: "Privacidad",
            },
        ].map(function (b) { return (<span key={b.en} className="inline-flex items-center gap-1.5 rounded-full border border-[#FFC700]/20 bg-[#FFC700]/[0.06] px-4 py-1.5 text-sm font-medium text-[#FFC700]">
                  {b.icon}
                  <T en={b.en} ua={b.ua} es={b.es}/>
                </span>); })}
            </div>

            {/* CTA */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a href="https://github.com/tpedchenko/pd" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FFC700] to-[#FFA800] px-6 py-3 text-sm font-semibold text-[#26282B] shadow-lg shadow-[#FFC700]/20 transition-all hover:shadow-[#FFC700]/30 hover:brightness-110">
                <lucide_react_1.Github className="h-4 w-4"/>
                <T en="Get Started" ua="Почати" es="Comenzar"/>
                <lucide_react_1.ChevronRight className="h-4 w-4"/>
              </a>
              <a href="https://pd.taras.cloud" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition-all hover:border-white/[0.2] hover:bg-white/[0.06]">
                <lucide_react_1.ExternalLink className="h-4 w-4"/>
                <T en="Live Demo" ua="Демо" es="Demo en vivo"/>
              </a>
            </div>
          </div>
        </section>

        {/* ==================== FEATURES ==================== */}
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <T as="h2" en="Everything you need, nothing you don't" ua="Все, що потрібно — і нічого зайвого" es="Todo lo que necesitas, nada que no" className="mb-3 text-3xl font-bold sm:text-4xl"/>
              <T as="p" en="11 modules that cover every aspect of your personal life." ua="11 модулів, які охоплюють кожен аспект твого особистого життя." es="11 modulos que cubren cada aspecto de tu vida personal." className="text-[#9a9ea6]"/>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={<lucide_react_1.Wallet className="h-5 w-5"/>} titleEn="Finance" titleUa="Фінанси" titleEs="Finanzas" descEn="Transaction tracking with automatic Monobank and bunq sync. Monthly budgets, weekly budget calculator, multi-currency support (EUR/UAH/USD), category breakdown, recurring payments, CSV import, and account balance overview." descUa="Відстеження транзакцій з автоматичною синхронізацією Monobank та bunq. Місячні бюджети, калькулятор тижневого бюджету, мультивалютність (EUR/UAH/USD), категорії витрат, регулярні платежі, імпорт CSV та огляд балансів." descEs="Seguimiento de transacciones con sincronizacion automatica de Monobank y bunq. Presupuestos mensuales, calculadora semanal, multi-moneda (EUR/UAH/USD), desglose por categorias, pagos recurrentes e importacion CSV." screenshot="finance"/>

              <FeatureCard icon={<lucide_react_1.TrendingUp className="h-5 w-5"/>} titleEn="Investments" titleUa="Інвестиції" titleEs="Inversiones" descEn="Portfolio tracking across IBKR, Trading 212, and eToro. NAV history charts, realized and unrealized P&L, asset allocation breakdown, automatic broker sync, and multi-currency position management in EUR." descUa="Портфельне відстеження через IBKR, Trading 212 та eToro. Графіки NAV, реалізований та нереалізований P&L, розподіл активів, автоматична синхронізація з брокерами, управління позиціями в EUR." descEs="Seguimiento de cartera en IBKR, Trading 212 y eToro. Graficos NAV, P&L realizado y no realizado, asignacion de activos, sincronizacion automatica de brokers y gestion multi-moneda en EUR." screenshot="investments"/>

              <FeatureCard icon={<lucide_react_1.Heart className="h-5 w-5"/>} titleEn="Health" titleUa="Здоров'я" titleEs="Salud" descEn="Full Garmin Connect sync: daily stats, sleep analysis, body composition, heart rate, HRV, Body Battery, stress levels, and VO2max tracking. Withings sync for weight and body fat percentage trends." descUa="Повна синхронізація з Garmin Connect: денна статистика, аналіз сну, склад тіла, пульс, HRV, Body Battery, рівень стресу та VO2max. Синхронізація Withings для ваги та відсотка жиру." descEs="Sincronizacion completa con Garmin Connect: estadisticas diarias, analisis del sueno, composicion corporal, frecuencia cardiaca, HRV, Body Battery, estres y VO2max. Sync de Withings para peso y grasa corporal." screenshot="health"/>

              <FeatureCard icon={<lucide_react_1.Dumbbell className="h-5 w-5"/>} titleEn="Gym & Workouts" titleUa="Зал і тренування" titleEs="Gimnasio y Entrenamientos" descEn="100+ exercise library with muscle group targeting. Custom workout programs, set/rep/weight tracking, automatic PR detection, muscle recovery heatmap, Garmin activity linking, and workout calendar with volume analysis." descUa="100+ вправ з прив'язкою до м'язових груп. Власні програми тренувань, відстеження підходів/повторень/ваги, автоматичне виявлення рекордів, карта відновлення м'язів, зв'язок з активностями Garmin та календар тренувань." descEs="100+ ejercicios con grupos musculares. Programas personalizados, seguimiento de series/repeticiones/peso, deteccion automatica de PR, mapa de recuperacion muscular, vinculacion con actividades Garmin y calendario." screenshot="gym"/>

              <FeatureCard icon={<lucide_react_1.Bot className="h-5 w-5"/>} titleEn="AI Assistant" titleUa="AI Асистент" titleEs="Asistente IA" descEn="Chat with your data using Gemini, Groq, or local Ollama models. RAG context from all modules enables cross-domain correlations. Per-page AI Insights with thumbs up/down feedback for continuous improvement." descUa="Спілкуйся зі своїми даними через Gemini, Groq або локальні моделі Ollama. RAG контекст з усіх модулів для кросс-доменних кореляцій. AI Insights на кожній сторінці з фідбеком для покращення." descEs="Chatea con tus datos usando Gemini, Groq o modelos locales Ollama. Contexto RAG de todos los modulos permite correlaciones cruzadas. AI Insights por pagina con feedback para mejora continua." screenshot="ai-chat"/>

              <FeatureCard icon={<lucide_react_1.Sun className="h-5 w-5"/>} titleEn="My Day" titleUa="Мій день" titleEs="Mi Dia" descEn="Daily mood, energy, stress, and focus tracking. Journal entries for notes and reflections. Garmin health data overview for the day including sleep quality, steps, and heart rate zones." descUa="Щоденне відстеження настрою, енергії, стресу та фокусу. Записи в журналі для нотаток і роздумів. Огляд даних Garmin за день: якість сну, кроки та зони пульсу." descEs="Seguimiento diario de animo, energia, estres y concentracion. Entradas de diario para notas y reflexiones. Vista general de datos Garmin del dia: calidad de sueno, pasos y zonas cardiacas." screenshot="my-day"/>

              <FeatureCard icon={<lucide_react_1.UtensilsCrossed className="h-5 w-5"/>} titleEn="Food Tracking" titleUa="Їжа" titleEs="Alimentacion" descEn="Calorie and protein intake tracking with configurable daily targets. Daily summaries with macronutrient breakdown and 30-day calorie trend charts to visualize your nutrition patterns." descUa="Відстеження калорій та білка з налаштовуваними денними цілями. Денні підсумки з розбивкою макронутрієнтів та 30-денні графіки трендів калорій для візуалізації харчових звичок." descEs="Seguimiento de calorias y proteinas con objetivos diarios configurables. Resumenes diarios con desglose de macronutrientes y graficos de tendencias de 30 dias." screenshot="food"/>

              <FeatureCard icon={<lucide_react_1.ShoppingCart className="h-5 w-5"/>} titleEn="Shopping List" titleUa="Список покупок" titleEs="Lista de Compras" descEn="Shared shopping lists with quick expense logging. Purchase history with statistics. AI-powered insights analyze spending patterns and suggest optimizations." descUa="Спільні списки покупок зі швидким записом витрат. Історія покупок зі статистикою. AI-інсайти аналізують шаблони витрат та пропонують оптимізації." descEs="Listas de compras compartidas con registro rapido de gastos. Historial de compras con estadisticas. AI Insights analizan patrones de gasto y sugieren optimizaciones." screenshot="list"/>

              <FeatureCard icon={<lucide_react_1.BarChart3 className="h-5 w-5"/>} titleEn="Trading" titleUa="Трейдинг" titleEs="Trading" descEn="Freqtrade bot integration with real-time control. Strategy management, start/stop bot, force-exit trades, dry-run and live modes. Cumulative P&L charts, win rate, and per-pair performance analysis." descUa="Інтеграція з Freqtrade ботом з управлінням в реальному часі. Управління стратегіями, старт/стоп бота, примусовий вихід з позицій, dry-run та live режими. Графіки P&L, вінрейт та аналіз по парах." descEs="Integracion con bot Freqtrade con control en tiempo real. Gestion de estrategias, inicio/parada del bot, salida forzada, modos dry-run y live. Graficos P&L, win rate y analisis por par." screenshot="trading"/>

              <FeatureCard icon={<lucide_react_1.FileText className="h-5 w-5"/>} titleEn="Tax Reporting" titleUa="Податкова звітність" titleEs="Declaracion Fiscal" descEn="Ukrainian FOP tax reporting with DPS API integration and F0103309 import. Spanish IRPF calculator with nomina parser, Modelo 100 simulator, and broker report parsers for investment income." descUa="Податкова звітність ФОП з інтеграцією DPS API та імпортом F0103309. Іспанський калькулятор IRPF з парсером номін, симулятором Modelo 100 та парсерами брокерських звітів для інвестиційного доходу." descEs="Declaracion fiscal para autonomos ucranianos con API DPS e importacion F0103309. Calculadora IRPF espanola con parser de nominas, simulador Modelo 100 y parsers de informes de brokers." screenshot="reporting"/>

              <FeatureCard icon={<lucide_react_1.Activity className="h-5 w-5"/>} titleEn="Dashboard & Correlations" titleUa="Дашборд і кореляції" titleEs="Panel y Correlaciones" descEn="Unified dashboard with KPIs across all modules. Life, finance, and training tabs. Lifestyle correlations between sleep, mood, exercise, and spending. Monthly deep-dive analysis and HRV trends." descUa="Єдиний дашборд з KPI по всіх модулях. Вкладки Життя, Фінанси та Тренування. Кореляції стилю життя між сном, настроєм, тренуваннями та витратами. Місячний аналіз та тренди HRV." descEs="Panel unificado con KPIs de todos los modulos. Pestanas Vida, Finanzas y Entrenamiento. Correlaciones de estilo de vida entre sueno, animo, ejercicio y gastos. Analisis mensual y tendencias HRV." screenshot="dashboard"/>
            </div>
          </div>
        </section>

        {/* ==================== INTEGRATIONS ==================== */}
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <T as="h2" en="Connects to your services" ua="Підключається до твоїх сервісів" es="Se conecta a tus servicios" className="mb-3 text-3xl font-bold sm:text-4xl"/>
            <T as="p" en="Automatic sync with the services you already use." ua="Автоматична синхронізація з сервісами, які ти вже використовуєш." es="Sincronizacion automatica con los servicios que ya usas." className="mb-8 text-[#9a9ea6]"/>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <IntBadge name="Garmin Connect"/>
              <IntBadge name="Monobank"/>
              <IntBadge name="bunq"/>
              <IntBadge name="Interactive Brokers"/>
              <IntBadge name="Trading 212"/>
              <IntBadge name="eToro"/>
              <IntBadge name="Freqtrade"/>
              <IntBadge name="Withings"/>
              <IntBadge name="Telegram Bot"/>
              <IntBadge name="Kraken"/>
              <IntBadge name="Binance"/>
              <IntBadge name="Cobee"/>
              <IntBadge name="DPS (UA Tax)"/>
            </div>
          </div>
        </section>

        {/* ==================== TECH STACK ==================== */}
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <T as="h2" en="Built with modern tools" ua="Побудовано на сучасних технологіях" es="Construido con herramientas modernas" className="mb-3 text-3xl font-bold sm:text-4xl"/>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {/* Frontend */}
              <div>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#FFC700]">
                  Frontend
                </h3>
                <div className="flex flex-col gap-2">
                  <TechBadge icon={<lucide_react_1.Zap className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Next.js 16"/>
                  <TechBadge icon={<lucide_react_1.Zap className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="React 19"/>
                  <TechBadge icon={<lucide_react_1.Zap className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="TypeScript 5"/>
                  <TechBadge icon={<lucide_react_1.Zap className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Tailwind CSS 4"/>
                  <TechBadge icon={<lucide_react_1.Smartphone className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="PWA (Serwist)"/>
                </div>
              </div>

              {/* Backend */}
              <div>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#FFC700]">
                  Backend
                </h3>
                <div className="flex flex-col gap-2">
                  <TechBadge icon={<lucide_react_1.Database className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="PostgreSQL"/>
                  <TechBadge icon={<lucide_react_1.Database className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Prisma 7"/>
                  <TechBadge icon={<lucide_react_1.Zap className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Python Scheduler"/>
                  <TechBadge icon={<lucide_react_1.Database className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Redis"/>
                  <TechBadge icon={<lucide_react_1.Database className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="PgBouncer"/>
                </div>
              </div>

              {/* AI */}
              <div>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#FFC700]">
                  AI
                </h3>
                <div className="flex flex-col gap-2">
                  <TechBadge icon={<lucide_react_1.Brain className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Ollama (local)"/>
                  <TechBadge icon={<lucide_react_1.Brain className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Gemini 2.5"/>
                  <TechBadge icon={<lucide_react_1.Brain className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Groq"/>
                  <TechBadge icon={<lucide_react_1.Database className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="pgvector"/>
                  <TechBadge icon={<lucide_react_1.Brain className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Vercel AI SDK"/>
                </div>
              </div>

              {/* Infra */}
              <div>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#FFC700]">
                  Infrastructure
                </h3>
                <div className="flex flex-col gap-2">
                  <TechBadge icon={<lucide_react_1.Server className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Docker"/>
                  <TechBadge icon={<lucide_react_1.Globe className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="3 Languages"/>
                  <TechBadge icon={<lucide_react_1.Lock className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="NextAuth 5"/>
                  <TechBadge icon={<lucide_react_1.Lock className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="SOPS + age"/>
                  <TechBadge icon={<lucide_react_1.Calculator className="h-3.5 w-3.5 text-[#FFC700]/60"/>} name="Playwright + Vitest"/>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== SELF-HOSTED ==================== */}
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-[#FFC700]/20 bg-gradient-to-br from-[#FFC700]/[0.04] to-transparent p-8 sm:p-12">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFC700]/10">
                <lucide_react_1.Server className="h-7 w-7 text-[#FFC700]"/>
              </div>

              <T as="h2" en="Self-hosted. Your rules." ua="Самохостинг. Твої правила." es="Autoalojado. Tus reglas." className="mb-4 text-2xl font-bold sm:text-3xl"/>

              <div className="space-y-4 text-[#9a9ea6]">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFC700]/10">
                    <lucide_react_1.ChevronRight className="h-3 w-3 text-[#FFC700]"/>
                  </div>
                  <div>
                    <T as="p" en='One <code class="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-mono text-white">docker compose up</code> and you&apos;re running' ua='Один <code class="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-mono text-white">docker compose up</code> — і все працює' es='Un <code class="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs font-mono text-white">docker compose up</code> y listo' className="text-sm leading-relaxed"/>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFC700]/10">
                    <lucide_react_1.ChevronRight className="h-3 w-3 text-[#FFC700]"/>
                  </div>
                  <T as="p" en="Your data stays on your server. No telemetry, no third-party analytics, no tracking." ua="Твої дані залишаються на твоєму сервері. Без телеметрії, сторонньої аналітики чи трекінгу." es="Tus datos se quedan en tu servidor. Sin telemetria, sin analitica de terceros, sin rastreo." className="text-sm leading-relaxed"/>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFC700]/10">
                    <lucide_react_1.ChevronRight className="h-3 w-3 text-[#FFC700]"/>
                  </div>
                  <T as="p" en="No cloud dependency. External API keys (for AI providers and bank sync) are optional — the core works offline." ua="Без залежності від хмари. Зовнішні API ключі (для AI та банківської синхронізації) опціональні — ядро працює офлайн." es="Sin dependencia del cloud. Las claves API externas (para IA y sincronizacion bancaria) son opcionales — el nucleo funciona offline." className="text-sm leading-relaxed"/>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFC700]/10">
                    <lucide_react_1.ChevronRight className="h-3 w-3 text-[#FFC700]"/>
                  </div>
                  <T as="p" en="Modular design — enable only the features you need. Turn off modules you don&apos;t use." ua="Модульний дизайн — увімкни лише те, що потрібно. Вимкни модулі, які не використовуєш." es="Diseno modular — activa solo lo que necesitas. Desactiva los modulos que no uses." className="text-sm leading-relaxed"/>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== FOOTER ==================== */}
        <footer className="border-t border-white/[0.06] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-4">
              <a href="https://github.com/tpedchenko/pd" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#9a9ea6] transition-colors hover:text-white">
                <lucide_react_1.Github className="h-4 w-4"/>
                GitHub
              </a>
              <span className="text-white/20">|</span>
              <span className="text-sm text-[#9a9ea6]">AGPL-3.0</span>
              <span className="text-white/20">|</span>
              <a href="https://taras.cloud" target="_blank" rel="noopener noreferrer" className="text-sm text-[#9a9ea6] transition-colors hover:text-white">
                taras.cloud
              </a>
            </div>
            <p className="text-xs text-[#9a9ea6]/60">
              <T en="Made by Taras Pedchenko" ua="Зроблено Тарасом Педченком" es="Hecho por Taras Pedchenko"/>
            </p>
          </div>
        </footer>
      </div>

      {/* ==================== STYLES ==================== */}
      <style dangerouslySetInnerHTML={{
            __html: "\n/* Language switcher \u2014 matching taras.cloud */\n.lang-switch {\n  position: fixed;\n  top: 1rem;\n  right: 1rem;\n  z-index: 10000;\n  display: inline-flex;\n  border: 1px solid #3a3d42;\n  border-radius: 6px;\n  overflow: hidden;\n  background: rgba(38,40,43,0.85);\n  backdrop-filter: blur(8px);\n  -webkit-backdrop-filter: blur(8px);\n  box-shadow: 0 2px 8px rgba(0,0,0,0.3);\n}\n.lang-btn {\n  padding: 0.35rem 0.7rem;\n  background: transparent;\n  color: #9a9ea6;\n  border: none;\n  font-size: 0.8rem;\n  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n}\n.lang-btn.active {\n  background: #FFC700;\n  color: #fff;\n}\n.lang-btn:hover:not(.active) {\n  background: #353940;\n}\n\n@media (max-width: 640px) {\n  .lang-switch {\n    top: 0.5rem;\n    right: 0.5rem;\n  }\n  .lang-btn {\n    padding: 0.25rem 0.5rem;\n    font-size: 0.75rem;\n  }\n}\n          ",
        }}/>
    </>);
}
