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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { pct, pctFromRatio, usd } from '../lib/format';
import { AccionBadge, FreshnessNote, PageHeader, ROUTES, StateBlock } from '../components/ui-kit';

export function PricingPage() {
  const [ruta, setRuta] = useState('BOG-MIA');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { data, loading, error } = useAsync(() => api.recommendation(ruta), [ruta]);
  const rec = data?.recomendacion ?? null;
  const inputs = data?.inputs ?? null;

  const proponer = async () => {
    if (!rec || !inputs) return;
    setEnviando(true);
    setMsg(null);
    try {
      await api.createAction({
        rutaId: ruta,
        cabina: 'Economy',
        claseTarifa: 'Standard',
        tipoAccion: rec.accion,
        tarifaAnteriorUsd: inputs.tarifaPropia,
        tarifaNuevaUsd: rec.tarifaSugeridaUsd,
        deltaPct: rec.deltaPct,
        motivo: rec.motivo,
      });
      setMsg({ tone: 'ok', text: 'Propuesta creada en estado "propuesta". Revisala en Acciones operacionales.' });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'No se pudo crear la propuesta' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Recomendacion de pricing"
        subtitle="El motor de reglas es transparente: te muestra los insumos exactos que uso y por que recomienda subir, bajar o mantener."
        actions={
          <Select value={ruta} onValueChange={(v) => { setRuta(v); setMsg(null); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Ruta" />
            </SelectTrigger>
            <SelectContent>
              {ROUTES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <StateBlock loading={loading} error={error} isEmpty={!rec} skeletonRows={4}>
        {rec && inputs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Insumos usados</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="Ruta" v={`${inputs.rutaId} (${inputs.region})`} />
                <Row k="Ocupacion (30d volados)" v={pctFromRatio(inputs.ocupacion)} />
                <Row k="Tarifa propia (Economy Standard)" v={usd(inputs.tarifaPropia)} />
                <Row k="Mediana competidores" v={usd(inputs.compMediana)} />
                <Row k="Brecha vs mercado" v={pct(rec.brechaPct)} />
                <Row k="Indice de demanda reciente" v={inputs.indiceDemanda.toFixed(2)} />
                <Row k="Forecast de ocupacion" v={pctFromRatio(inputs.forecastOcupacion)} />
                <FreshnessNote fuente="gold (flights, current_fares, competitor_fares, route_demand)" periodo="30 dias volados / 14 dias demanda" />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>Recomendacion</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <AccionBadge accion={rec.accion} />
                  <span className="text-2xl font-bold text-foreground">{usd(rec.tarifaSugeridaUsd)}</span>
                  {rec.deltaPct !== 0 && (
                    <span className="text-sm text-muted-foreground">({pct(rec.deltaPct)})</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{rec.motivo}</p>
                <Button onClick={() => void proponer()} disabled={enviando}>
                  {enviando ? 'Creando...' : 'Proponer cambio'}
                </Button>
                {msg && (
                  <Alert variant={msg.tone === 'ok' ? 'default' : 'destructive'}>
                    {msg.tone === 'ok' && <CheckCircle2 className="h-4 w-4" />}
                    <AlertTitle>{msg.tone === 'ok' ? 'Propuesta creada' : 'Error'}</AlertTitle>
                    <AlertDescription>{msg.text}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </StateBlock>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-foreground">{v}</span>
    </div>
  );
}
