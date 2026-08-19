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
import { api, numish } from '../lib/api';
import type { PricingAction } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { fecha, pct, usd } from '../lib/format';
import { AccionBadge, EstadoAccionBadge, PageHeader, StateBlock } from '../components/ui-kit';

const ESTADOS = ['todas', 'propuesta', 'aprobada', 'rechazada', 'aplicada'];

export function AccionesPage() {
  const [filtro, setFiltro] = useState('todas');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(
    () => api.listActions(filtro === 'todas' ? undefined : filtro),
    [filtro],
  );
  const acciones = data ?? [];

  const decidir = async (id: string, accion: 'aprobar' | 'rechazar' | 'aplicar') => {
    setBusy(id + accion);
    setErr(null);
    try {
      await api.decideAction(id, accion);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar la accion');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Acciones operacionales con aprobacion"
        subtitle="El ciclo es explicito: analizar, decidir y actuar. Cada propuesta se aprueba o rechaza, y al aplicarla queda registrado el cambio de tarifa. Todo movimiento se audita."
        actions={
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e === 'todas' ? 'Todos los estados' : e}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      {err && (
        <Card className="shadow-sm mb-3 border-destructive">
          <CardContent className="py-3 text-sm" style={{ color: 'var(--destructive)' }}>{err}</CardContent>
        </Card>
      )}

      <StateBlock loading={loading} error={error} isEmpty={acciones.length === 0} skeletonRows={5}
        emptyDescription="No hay propuestas de pricing en este estado.">
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead className="text-right">Tarifa ant.</TableHead>
                  <TableHead className="text-right">Tarifa nueva</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Analista</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acciones.map((a: PricingAction) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.ruta_id}</TableCell>
                    <TableCell><AccionBadge accion={a.tipo_accion} /></TableCell>
                    <TableCell className="text-right tabular-nums">{usd(numish(a.tarifa_anterior_usd))}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(numish(a.tarifa_nueva_usd))}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(numish(a.delta_pct))}</TableCell>
                    <TableCell className="text-muted-foreground">{a.analista ?? '-'}</TableCell>
                    <TableCell><EstadoAccionBadge estado={a.estado} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fecha(a.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.estado === 'propuesta' && (
                          <>
                            <Button size="sm" onClick={() => void decidir(a.id, 'aprobar')} disabled={busy !== null}>Aprobar</Button>
                            <Button size="sm" variant="outline" onClick={() => void decidir(a.id, 'rechazar')} disabled={busy !== null}>Rechazar</Button>
                          </>
                        )}
                        {a.estado === 'aprobada' && (
                          <Button size="sm" onClick={() => void decidir(a.id, 'aplicar')} disabled={busy !== null}>Aplicar</Button>
                        )}
                        {(a.estado === 'aplicada' || a.estado === 'rechazada') && (
                          <span className="text-xs text-muted-foreground">Cerrada</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </StateBlock>

      <p className="text-xs text-muted-foreground mt-3">
        Motivo de la ultima propuesta seleccionada se conserva en el registro de auditoria. Las tarifas estan en USD.
      </p>
    </div>
  );
}
