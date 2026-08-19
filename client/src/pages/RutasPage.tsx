import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DonutChart,
  LineChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { pct, pctFromRatio, usd, usdCompact } from '../lib/format';
import { AccionBadge, FreshnessNote, PageHeader, StateBlock } from '../components/ui-kit';

const PAGE_SIZE = 8;
type SortKey = 'ruta_id' | 'ocupacion' | 'revenue_usd' | 'brecha_pct' | 'indice_demanda';

const COLS: { key: SortKey; label: string; sortable: boolean }[] = [
  { key: 'ruta_id', label: 'Ruta', sortable: true },
  { key: 'ocupacion', label: 'Ocupacion', sortable: true },
  { key: 'indice_demanda', label: 'Indice demanda', sortable: true },
  { key: 'revenue_usd', label: 'Revenue 30d', sortable: true },
  { key: 'brecha_pct', label: 'Brecha vs mercado', sortable: true },
];

export function RutasPage() {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('revenue_usd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detalle, setDetalle] = useState<string | null>(null);

  const { data, loading, error } = useAnalyticsQuery('route_explorer', {
    limit: sql.int(PAGE_SIZE),
    offset: sql.int(page * PAGE_SIZE),
    sort_key: sql.string(sortKey),
    sort_dir: sql.string(sortDir),
  });

  const filas = data ?? [];
  const total = filas.length > 0 ? Number(filas[0].total_rutas) : 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Explorador de rutas"
        subtitle="Las 16 rutas ordenadas y paginadas en el warehouse. La brecha compara nuestra Economy Standard contra la mediana de competidores; la accion sugerida aplica los umbrales del motor de reglas."
      />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>
            Rutas {total > 0 ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StateBlock loading={loading} error={error} isEmpty={filas.length === 0} skeletonRows={PAGE_SIZE}>
            <Table>
              <TableHeader>
                <TableRow>
                  {COLS.map((c) => (
                    <TableHead key={c.key}>
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        >
                          {c.label}
                          {sortKey === c.key &&
                            (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : (
                        c.label
                      )}
                    </TableHead>
                  ))}
                  <TableHead>Tarifa vs competidor</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((r) => (
                  <TableRow key={r.ruta_id}>
                    <TableCell className="font-medium">
                      {r.ruta_id}
                      <span className="block text-xs text-muted-foreground">{r.region}</span>
                    </TableCell>
                    <TableCell>{pctFromRatio(r.ocupacion)}</TableCell>
                    <TableCell>{r.indice_demanda?.toFixed(2)}</TableCell>
                    <TableCell>{usdCompact(r.revenue_usd)}</TableCell>
                    <TableCell style={{ color: r.brecha_pct < 0 ? 'var(--destructive)' : 'var(--foreground)' }}>
                      {pct(r.brecha_pct)}
                    </TableCell>
                    <TableCell>
                      {usd(r.tarifa_propia)} <span className="text-muted-foreground">vs {usd(r.comp_mediana)}</span>
                    </TableCell>
                    <TableCell>
                      <AccionBadge accion={r.accion} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetalle(r.ruta_id)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4">
              <FreshnessNote fuente="gold.flights + current_fares + competitor_fares + route_demand" periodo="Ocupacion y revenue: 30 dias volados" />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {page + 1} de {maxPage + 1}
                </span>
                <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>
                  Siguiente <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </StateBlock>
        </CardContent>
      </Card>

      <Dialog open={detalle !== null} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de ruta {detalle}</DialogTitle>
            <DialogDescription>Curva de reserva, demanda en el tiempo y mezcla de ancillary.</DialogDescription>
          </DialogHeader>
          {detalle && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-1">Curva de reserva (ocupacion por dias a la salida)</h4>
                <LineChart
                  queryKey="booking_curve"
                  parameters={{ ruta_id: sql.string(detalle) }}
                  xKey="dias_a_salida"
                  yKey="load_factor"
                  colorPalette="categorical"
                  height={220}
                />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-1">Indice de demanda en el tiempo</h4>
                <LineChart
                  queryKey="route_demand_series"
                  parameters={{ ruta_id: sql.string(detalle) }}
                  xKey="fecha"
                  yKey="indice_demanda"
                  colorPalette="categorical"
                  height={200}
                />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-1">Mezcla de ancillary (revenue por tipo, 12 meses)</h4>
                <DonutChart
                  queryKey="route_ancillary_mix"
                  parameters={{ ruta_id: sql.string(detalle) }}
                  xKey="tipo_ancillary"
                  yKey="revenue_usd"
                  colorPalette="categorical"
                  height={240}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
