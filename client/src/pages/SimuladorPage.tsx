import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from '@databricks/appkit-ui/react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { pct, pctFromRatio, signed, usd } from '../lib/format';
import { FreshnessNote, KpiCard, PageHeader, ROUTES, StateBlock } from '../components/ui-kit';

const ELASTICIDADES = [0.8, 1.0, 1.2, 1.5];

export function SimuladorPage() {
  const [ruta, setRuta] = useState('BOG-SCL');
  const [price, setPrice] = useState(0);
  const [committed, setCommitted] = useState(0);
  const [elasticidad, setElasticidad] = useState(1.2);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const sim = useAsync(() => api.simulate({ rutaId: ruta, priceChangePct: committed, elasticidad }), [ruta, committed, elasticidad]);
  const s = sim.data?.simulacion ?? null;
  const base = sim.data?.base ?? null;

  const guardar = async () => {
    if (!s || !base) return;
    setGuardando(true);
    setMsg(null);
    const tipo = committed > 0 ? 'SUBIR' : committed < 0 ? 'BAJAR' : 'MANTENER';
    try {
      await api.createAction({
        rutaId: ruta,
        cabina: 'Economy',
        claseTarifa: 'Standard',
        tipoAccion: tipo,
        tarifaAnteriorUsd: base.tarifaPropia,
        tarifaNuevaUsd: s.tarifaProyectadaUsd,
        deltaPct: committed,
        motivo: `Simulacion what-if: ${s.formula} Revenue proyectado ${usd(s.revenueProyectadoUsd)} (${signed(s.revenueDeltaPct)}%).`,
      });
      setMsg({ tone: 'ok', text: 'Escenario guardado como propuesta. Revisalo en Acciones operacionales.' });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Simulador what-if de precio"
        subtitle="Mueve el precio y observa como la elasticidad arrastra la demanda, la ocupacion y el revenue. La formula queda a la vista."
        actions={
          <Select value={ruta} onValueChange={(v) => { setRuta(v); setPrice(0); setCommitted(0); setMsg(null); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Ruta" /></SelectTrigger>
            <SelectContent>
              {ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <Card className="shadow-sm mb-4">
        <CardHeader><CardTitle>Palanca de precio</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <Label>Cambio de precio</Label>
              <span className="font-semibold text-foreground">{pct(price, 0)}</span>
            </div>
            <Slider
              value={[price]}
              min={-30}
              max={30}
              step={1}
              onValueChange={([v]) => setPrice(v)}
              onValueCommit={([v]) => setCommitted(v)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label>Elasticidad (Economy)</Label>
            <Select value={String(elasticidad)} onValueChange={(v) => setElasticidad(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ELASTICIDADES.map((e) => <SelectItem key={e} value={String(e)}>{e.toFixed(1)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Un +1% de precio mueve la demanda en -{elasticidad}%.</span>
          </div>
        </CardContent>
      </Card>

      <StateBlock loading={sim.loading} error={sim.error} isEmpty={!s} skeletonRows={3}>
        {s && base && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Tarifa proyectada" value={usd(s.tarifaProyectadaUsd)} periodo={`Base ${usd(base.tarifaPropia)}`} />
              <KpiCard label="Ocupacion proyectada" value={pctFromRatio(s.ocupacionProyectada)} periodo={`Base ${pctFromRatio(base.ocupacion)}`} />
              <KpiCard
                label="Cambio de demanda"
                value={pct(s.demandaChangePct)}
                deltaPositive={s.demandaChangePct >= 0}
                goodWhenPositive
                deltaText="por elasticidad"
                periodo="Modelo"
              />
              <KpiCard
                label="Delta de revenue"
                value={usd(s.revenueDeltaUsd)}
                deltaText={`${signed(s.revenueDeltaPct)}%`}
                deltaPositive={s.revenueDeltaPct >= 0}
                goodWhenPositive
                periodo={`Base ${usd(base.revenue30Usd)}`}
              />
            </div>
            <Card className="shadow-sm mt-4">
              <CardHeader><CardTitle>Como se calcula</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{s.formula}</p>
                <Button onClick={() => void guardar()} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar como propuesta'}
                </Button>
                {msg && (
                  <Alert variant={msg.tone === 'ok' ? 'default' : 'destructive'}>
                    {msg.tone === 'ok' && <CheckCircle2 className="h-4 w-4" />}
                    <AlertTitle>{msg.tone === 'ok' ? 'Guardado' : 'Error'}</AlertTitle>
                    <AlertDescription>{msg.text}</AlertDescription>
                  </Alert>
                )}
                <FreshnessNote fuente="gold + motor de elasticidad" periodo="Revenue base: 30 dias volados" />
              </CardContent>
            </Card>
          </>
        )}
      </StateBlock>
    </div>
  );
}
