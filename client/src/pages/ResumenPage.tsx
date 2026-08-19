import { AreaChart, Card, CardContent, CardHeader, CardTitle } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { intFmt, pctFromRatio, signed, usd, usdCompact } from '../lib/format';
import { FreshnessNote, KpiCard, PageHeader, StateBlock } from '../components/ui-kit';

export function ResumenPage() {
  const { data, loading, error } = useAsync(() => api.summary(), []);
  const kpi = data?.kpi ?? null;
  const periodo = kpi ? `Ultimos ${kpi.periodoDias} dias volados` : undefined;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Resumen ejecutivo de la red"
        subtitle="Salud de revenue y ocupacion de las 16 rutas, con las alertas y decisiones de pricing pendientes. Todo en USD."
      />
      <StateBlock loading={loading} error={error} isEmpty={!kpi} skeletonRows={4}>
        {kpi && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                label="Revenue total"
                value={usdCompact(kpi.revenueTotalUsd)}
                deltaText={`${signed(kpi.revenueDeltaPct)}% vs 30 dias previos`}
                deltaPositive={kpi.revenueDeltaPct >= 0}
                goodWhenPositive
                periodo={periodo}
                freshness={kpi.freshness}
              />
              <KpiCard
                label="Load factor promedio"
                value={pctFromRatio(kpi.loadFactorProm)}
                deltaText={`${signed(kpi.loadFactorDeltaPts)} pts vs 30 dias previos`}
                deltaPositive={kpi.loadFactorDeltaPts >= 0}
                goodWhenPositive
                periodo={periodo}
                freshness={kpi.freshness}
              />
              <KpiCard
                label="RASK proxy"
                value={usd(kpi.raskProxyUsd, 4)}
                unit="por asiento-km"
                periodo={periodo}
                freshness={kpi.freshness}
              />
              <KpiCard
                label="Yield por pasajero"
                value={usd(kpi.yieldPaxUsd)}
                unit="revenue de pasaje / pax"
                periodo={periodo}
                freshness={kpi.freshness}
              />
              <KpiCard
                label="Ancillary por pasajero"
                value={usd(kpi.ancillaryPorPaxUsd, 2)}
                periodo={periodo}
                freshness={kpi.freshness}
              />
              <div className="grid grid-cols-2 gap-4">
                <KpiCard label="Alertas abiertas" value={intFmt(data?.alertasAbiertas ?? 0)} periodo="Estado actual" />
                <KpiCard label="Acciones pendientes" value={intFmt(data?.accionesPendientes ?? 0)} periodo="Propuestas" />
              </div>
            </div>

            <Card className="shadow-sm mt-6">
              <CardHeader>
                <CardTitle>Revenue diario de la red sube y baja con la estacionalidad</CardTitle>
              </CardHeader>
              <CardContent>
                <AreaChart
                  queryKey="revenue_trend"
                  parameters={{ dias: sql.int(60) }}
                  xKey="fecha"
                  yKey="revenue_usd"
                  colorPalette="categorical"
                  height={300}
                />
                <FreshnessNote fuente="gold.flights (vuelos volados)" periodo="Ultimos 60 dias" fecha={kpi.freshness} />
              </CardContent>
            </Card>
          </>
        )}
      </StateBlock>
    </div>
  );
}
