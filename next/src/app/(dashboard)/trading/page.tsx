import { getTradingOverview, getTradingHistory, getTradingDailyProfit, getTradingStrategies, getStrategyConfigs } from "@/actions/trading";
import { TradingDashboard } from "./trading-dashboard";
import { StrategyManager } from "./strategy-manager";
import { FinanceSubTabs } from "@/components/shared/finance-sub-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleGate } from "@/components/shared/module-gate";

export default async function TradingPage() {
  const [overview, history, daily, strategies, strategyConfigs] = await Promise.all([
    getTradingOverview(),
    getTradingHistory(100),
    getTradingDailyProfit(30),
    getTradingStrategies(),
    getStrategyConfigs(),
  ]);

  const hasData = overview.profit !== null || history.trades.length > 0;

  return (
    <ModuleGate moduleKey="trading">
    <div className="space-y-3">
      <FinanceSubTabs />

      {!hasData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Як почати автоматичну торгівлю</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>1. Freqtrade бот</strong> — працює на NAS в Docker контейнері, торгує на Kraken.</p>
            <p><strong>2. Налаштування стратегії:</strong> в секції &quot;Strategy Manager&quot; нижче обери стратегію та задай параметри (пари, timeframe, stake amount).</p>
            <p><strong>3. Dry-run режим:</strong> спочатку запусти в dry-run (тестовий) режимі щоб перевірити стратегію без реальних грошей.</p>
            <p><strong>4. Live режим:</strong> після успішного dry-run переключи на live. Бот автоматично відкриватиме та закриватиме позиції.</p>
            <p><strong>5. Моніторинг:</strong> графіки P&amp;L, історія угод та статистика відображаються нижче автоматично.</p>
            <p className="text-xs mt-3 pt-2 border-t">Freqtrade Web UI: <code>http://your-nas-ip:8082</code> | Стратегії в <code>/opt/docker/freqtrade/</code></p>
          </CardContent>
        </Card>
      )}

      <StrategyManager configs={strategyConfigs} availableStrategies={strategies.strategies} />
      <TradingDashboard overview={overview} history={history} daily={daily} strategies={strategies.strategies} />
    </div>
    </ModuleGate>
  );
}
