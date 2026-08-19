// Cliente tipado del API Express. Ninguna mutacion sale directo del navegador
// hacia los datos: todo pasa por estas rutas, que validan con Zod y auditan.

export interface NetworkKpis {
  revenueTotalUsd: number;
  revenueDeltaPct: number;
  loadFactorProm: number;
  loadFactorDeltaPts: number;
  raskProxyUsd: number;
  yieldPaxUsd: number;
  ancillaryPorPaxUsd: number;
  freshness: string;
  periodoDias: number;
}

export interface Summary {
  kpi: NetworkKpis | null;
  alertasAbiertas: number;
  accionesPendientes: number;
  generadoEn: string;
}

export interface RouteInputs {
  rutaId: string;
  region: string;
  ocupacion: number;
  tarifaPropia: number;
  compMediana: number;
  indiceDemanda: number;
  forecastOcupacion: number;
  revenue30Usd: number;
}

export type Accion = 'SUBIR' | 'BAJAR' | 'MANTENER';

export interface Recommendation {
  accion: Accion;
  deltaPct: number;
  tarifaSugeridaUsd: number;
  brechaPct: number;
  motivo: string;
  inputs: RouteInputs;
}

export interface RecommendationResponse {
  motor: string;
  inputs: RouteInputs;
  recomendacion: Recommendation;
}

export interface SimulationResult {
  priceChangePct: number;
  elasticidad: number;
  demandaChangePct: number;
  ocupacionProyectada: number;
  tarifaProyectadaUsd: number;
  revenueProyectadoUsd: number;
  revenueDeltaPct: number;
  revenueDeltaUsd: number;
  formula: string;
}

export interface SimulationResponse {
  ruta: string;
  base: { tarifaPropia: number; ocupacion: number; revenue30Usd: number };
  simulacion: SimulationResult;
}

export interface PricingAction {
  id: string;
  ruta_id: string;
  cabina: string;
  clase_tarifa: string;
  tipo_accion: string;
  tarifa_anterior_usd: string | number | null;
  tarifa_nueva_usd: string | number | null;
  delta_pct: string | number | null;
  motivo: string | null;
  estado: string;
  analista: string | null;
  aprobador: string | null;
  created_at: string;
  decided_at: string | null;
  applied_at: string | null;
}

export interface Alert {
  id: string;
  ruta_id: string;
  tipo_alerta: string;
  severidad: string;
  mensaje: string | null;
  metrica: string | null;
  valor: string | number | null;
  umbral: string | number | null;
  estado: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface AuditEvent {
  id: string;
  actor: string | null;
  accion: string | null;
  entidad: string | null;
  entidad_id: string | null;
  payload: unknown;
  created_at: string;
}

export interface AssistantAnswer {
  proveedor: string;
  modo: string;
  disponible: boolean;
  texto: string;
  fuente: string;
  datos?: unknown;
}

export interface Whoami {
  email: string;
  ejecutaComo: string;
  onBehalfOf: boolean;
  nota: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // sin cuerpo JSON
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  summary: () => req<Summary>('/api/summary'),
  whoami: () => req<Whoami>('/api/whoami'),
  recommendation: (ruta: string) => req<RecommendationResponse>(`/api/pricing/recommendation/${ruta}`),
  simulate: (body: { rutaId: string; priceChangePct: number; elasticidad?: number }) =>
    req<SimulationResponse>('/api/pricing/simulate', { method: 'POST', body: JSON.stringify(body) }),
  listActions: (estado?: string) =>
    req<PricingAction[]>(`/api/pricing/actions${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`),
  createAction: (body: {
    rutaId: string;
    cabina: string;
    claseTarifa: string;
    tipoAccion: Accion | 'INVENTARIO';
    tarifaAnteriorUsd: number;
    tarifaNuevaUsd: number;
    deltaPct: number;
    motivo: string;
  }) => req<PricingAction>('/api/pricing/actions', { method: 'POST', body: JSON.stringify(body) }),
  decideAction: (id: string, accion: 'aprobar' | 'rechazar' | 'aplicar') =>
    req<PricingAction>(`/api/pricing/actions/${id}`, { method: 'PATCH', body: JSON.stringify({ accion }) }),
  listAlerts: (estado?: string) =>
    req<Alert[]>(`/api/alerts${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`),
  refreshAlerts: () => req<{ evaluadas: number; insertadas: number }>('/api/alerts/refresh', { method: 'POST' }),
  decideAlert: (id: string, accion: 'reconocer' | 'cerrar') =>
    req<Alert>(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ accion }) }),
  audit: (limit = 50) => req<AuditEvent[]>(`/api/audit?limit=${limit}`),
  ask: (pregunta: string) => req<AssistantAnswer>('/api/assistant', { method: 'POST', body: JSON.stringify({ pregunta }) }),
};

export const numish = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return NaN;
  return typeof v === 'number' ? v : Number(v);
};
