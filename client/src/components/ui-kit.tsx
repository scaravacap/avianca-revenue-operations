import type { ReactNode, CSSProperties } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';

// Encabezado de pantalla: titulo que carga el mensaje + bajada de contexto.
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Nota de frescura / origen del dato bajo cada vista analitica.
export function FreshnessNote({ fuente, fecha, periodo }: { fuente: string; fecha?: string; periodo?: string }) {
  return (
    <p className="text-xs text-muted-foreground mt-2">
      Fuente: {fuente}
      {periodo ? ` · Periodo: ${periodo}` : ''}
      {fecha ? ` · Datos al ${fecha}` : ''}
    </p>
  );
}

// Envoltura de estados obligatorios para cualquier vista de datos.
export function StateBlock({
  loading,
  error,
  isEmpty,
  emptyTitle = 'Sin datos',
  emptyDescription = 'No hay informacion para mostrar todavia.',
  skeletonRows = 3,
  children,
}: {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <Skeleton key={`sk-${i}`} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No se pudo cargar</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (isEmpty) {
    return (
      <Empty>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
        <EmptyDescription>{emptyDescription}</EmptyDescription>
      </Empty>
    );
  }
  return <>{children}</>;
}

// Pill semantico: usa tokens de tema, nunca hex crudo.
type Tone = 'success' | 'warning' | 'destructive' | 'primary' | 'muted';
const toneStyle: Record<Tone, CSSProperties> = {
  success: { backgroundColor: 'var(--success)', color: 'var(--success-foreground)' },
  warning: { backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' },
  destructive: { backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' },
  primary: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
  muted: { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' },
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={toneStyle[tone]}
    >
      {children}
    </span>
  );
}

export function AccionBadge({ accion }: { accion: string }) {
  if (accion === 'SUBIR') return <Pill tone="success">SUBIR</Pill>;
  if (accion === 'BAJAR') return <Pill tone="warning">BAJAR</Pill>;
  if (accion === 'INVENTARIO') return <Pill tone="primary">INVENTARIO</Pill>;
  return <Pill tone="muted">MANTENER</Pill>;
}

export function SeveridadBadge({ severidad }: { severidad: string }) {
  if (severidad === 'alta') return <Pill tone="destructive">Alta</Pill>;
  if (severidad === 'media') return <Pill tone="warning">Media</Pill>;
  return <Pill tone="muted">Baja</Pill>;
}

export function EstadoAccionBadge({ estado }: { estado: string }) {
  if (estado === 'aprobada') return <Pill tone="success">Aprobada</Pill>;
  if (estado === 'aplicada') return <Pill tone="primary">Aplicada</Pill>;
  if (estado === 'rechazada') return <Pill tone="destructive">Rechazada</Pill>;
  return <Badge variant="outline">Propuesta</Badge>;
}

export function EstadoAlertaBadge({ estado }: { estado: string }) {
  if (estado === 'abierta') return <Pill tone="warning">Abierta</Pill>;
  if (estado === 'reconocida') return <Badge variant="secondary">Reconocida</Badge>;
  return <Pill tone="muted">Cerrada</Pill>;
}

// Tarjeta KPI: valor + unidad + comparacion + periodo + frescura.
export function KpiCard({
  label,
  value,
  unit,
  deltaText,
  deltaPositive,
  goodWhenPositive = true,
  periodo,
  freshness,
}: {
  label: string;
  value: string;
  unit?: string;
  deltaText?: string;
  deltaPositive?: boolean;
  goodWhenPositive?: boolean;
  periodo?: string;
  freshness?: string;
}) {
  const isGood = deltaPositive === undefined ? undefined : deltaPositive === goodWhenPositive;
  const deltaStyle: CSSProperties | undefined =
    isGood === undefined ? undefined : { color: isGood ? 'var(--success)' : 'var(--destructive)' };
  const Icon = deltaPositive === undefined ? Minus : deltaPositive ? ArrowUp : ArrowDown;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {deltaText && (
          <div className="flex items-center gap-1 mt-1 text-xs font-medium" style={deltaStyle}>
            <Icon className="h-3 w-3" />
            <span>{deltaText}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          {periodo ? periodo : ''}
          {periodo && freshness ? ' · ' : ''}
          {freshness ? `al ${freshness}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

export const ROUTES = [
  'BOG-MIA', 'BOG-MDE', 'BOG-CTG', 'BOG-LIM', 'MDE-MIA', 'BOG-JFK', 'BOG-SCL', 'BOG-GRU',
  'BOG-EZE', 'BOG-CUN', 'BOG-CLO', 'BOG-MAD', 'BOG-LAX', 'BOG-MEX', 'BOG-PTY', 'BOG-SJO',
];
