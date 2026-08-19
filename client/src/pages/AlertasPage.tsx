import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import { RefreshCw } from 'lucide-react';
import { api, numish } from '../lib/api';
import type { Alert as AlertaRow } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { fecha } from '../lib/format';
import { EstadoAlertaBadge, PageHeader, SeveridadBadge, StateBlock } from '../components/ui-kit';

const ESTADOS = ['todas', 'abierta', 'reconocida', 'cerrada'];

const TIPO_LABEL: Record<string, string> = {
  precio_bajo_mercado: 'Precio bajo mercado',
  precio_sobre_mercado: 'Precio sobre mercado',
  ocupacion_baja: 'Ocupacion baja',
  demanda_atipica: 'Demanda atipica',
};

export function AlertasPage() {
  const [filtro, setFiltro] = useState('abierta');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(
    () => api.listAlerts(filtro === 'todas' ? undefined : filtro),
    [filtro],
  );
  const alertas = data ?? [];

  const refrescar = async () => {
    setBusy('refresh');
    setMsg(null);
    try {
      const r = await api.refreshAlerts();
      setMsg(`Reevaluadas ${r.evaluadas} rutas, ${r.insertadas} alertas nuevas.`);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo recalcular');
    } finally {
      setBusy(null);
    }
  };

  const decidir = async (id: string, accion: 'reconocer' | 'cerrar') => {
    setBusy(id + accion);
    try {
      await api.decideAlert(id, accion);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo actualizar la alerta');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Alertas de revenue"
        subtitle="Se calculan sobre las anomalias de las tablas gold y se persisten en Lakebase. Reconocer y cerrar deja rastro de auditoria."
        actions={
          <div className="flex items-center gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e === 'todas' ? 'Todos los estados' : e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void refrescar()} disabled={busy === 'refresh'}>
              <RefreshCw className="h-4 w-4 mr-1" />
              {busy === 'refresh' ? 'Recalculando...' : 'Recalcular'}
            </Button>
          </div>
        }
      />

      {msg && <p className="text-sm text-muted-foreground mb-3">{msg}</p>}

      <StateBlock loading={loading} error={error} isEmpty={alertas.length === 0} skeletonRows={5}
        emptyTitle="Sin alertas" emptyDescription="No hay alertas en este estado. Usa Recalcular para evaluar las rutas.">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Umbral</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertas.map((a: AlertaRow) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.ruta_id}</TableCell>
                    <TableCell>{TIPO_LABEL[a.tipo_alerta] ?? a.tipo_alerta}</TableCell>
                    <TableCell><SeveridadBadge severidad={a.severidad} /></TableCell>
                    <TableCell className="text-muted-foreground max-w-sm">{a.mensaje ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(a.valor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(a.umbral)}</TableCell>
                    <TableCell><EstadoAlertaBadge estado={a.estado} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fecha(a.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.estado === 'abierta' && (
                          <Button size="sm" variant="outline" onClick={() => void decidir(a.id, 'reconocer')} disabled={busy !== null}>Reconocer</Button>
                        )}
                        {a.estado !== 'cerrada' && (
                          <Button size="sm" onClick={() => void decidir(a.id, 'cerrar')} disabled={busy !== null}>Cerrar</Button>
                        )}
                        {a.estado === 'cerrada' && <span className="text-xs text-muted-foreground">Cerrada</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </StateBlock>
    </div>
  );
}

function fmt(v: string | number | null): string {
  const n = numish(v);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}
