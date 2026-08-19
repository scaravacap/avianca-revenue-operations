import { AppKit } from './appkit';
import { getNetworkKpis, getRevenueMesUsd, getRouteInputs, getRouteMetrics, RouteMetric } from './gold';

// Asistente conversacional detras de una interfaz desacoplada. El proveedor por
// defecto (DemoProvider) responde de forma determinista con SQL predefinido sobre
// las tablas gold. Si no hay dato, responde "No disponible" en vez de inventar.
//
// Quedan documentados dos proveedores DESHABILITADOS (Genie y Model Serving) que
// se activan por variable de entorno. No se encienden en este despliegue para que
// el asistente funcione sin dependencias externas.

export interface AssistantAnswer {
  disponible: boolean;
  texto: string;
  fuente: string;
  datos?: unknown;
}

export interface AssistantProvider {
  readonly nombre: string;
  readonly modo: string;
  ask(pregunta: string, appkit: AppKit): Promise<AssistantAnswer>;
}

const money = (v: number) => `USD ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`;

function accionFor(m: RouteMetric): 'SUBIR' | 'BAJAR' | 'MANTENER' {
  if (m.ocupacion >= 0.85 && m.brechaPct <= -5) return 'SUBIR';
  if (m.ocupacion <= 0.65 && m.brechaPct >= 5) return 'BAJAR';
  return 'MANTENER';
}

const RUTA_RE = /\b([A-Z]{3}-[A-Z]{3})\b/;

export class DemoProvider implements AssistantProvider {
  readonly nombre = 'Asistente demo (SQL determinista sobre gold)';
  readonly modo = 'demo';

  async ask(pregunta: string, appkit: AppKit): Promise<AssistantAnswer> {
    const q = pregunta.trim();
    const qlow = q.toLowerCase();
    const rutaMatch = q.toUpperCase().match(RUTA_RE);

    // Ocupacion de una ruta concreta.
    if (rutaMatch && qlow.includes('ocupaci')) {
      const ruta = rutaMatch[1];
      const inp = await getRouteInputs(appkit, ruta);
      if (!inp || !Number.isFinite(inp.ocupacion)) {
        return { disponible: false, texto: `No disponible: no encuentro ocupacion para ${ruta}.`, fuente: 'gold.flights' };
      }
      return {
        disponible: true,
        texto: `La ocupacion de ${ruta} en los ultimos 30 dias volados es ${pct(inp.ocupacion * 100, 1)}.`,
        fuente: 'gold.flights',
        datos: { ruta, ocupacion: inp.ocupacion },
      };
    }

    // Rutas candidatas a subir o bajar precio.
    if (qlow.includes('subir') || qlow.includes('bajar')) {
      const objetivo = qlow.includes('bajar') ? 'BAJAR' : 'SUBIR';
      const metrics = await getRouteMetrics(appkit);
      const hit = metrics.filter((m) => accionFor(m) === objetivo);
      if (hit.length === 0) {
        return { disponible: true, texto: `Ninguna ruta cumple hoy los umbrales para ${objetivo}.`, fuente: 'gold' };
      }
      const lista = hit
        .map((m) => `${m.rutaId} (ocupacion ${pct(m.ocupacion * 100)}, brecha ${pct(m.brechaPct, 1)})`)
        .join('; ');
      return {
        disponible: true,
        texto: `Rutas con recomendacion ${objetivo}: ${lista}.`,
        fuente: 'gold.flights + gold.current_fares + gold.competitor_fares',
        datos: hit.map((m) => m.rutaId),
      };
    }

    // Revenue del mes / periodo.
    if (qlow.includes('revenue') || qlow.includes('ingreso')) {
      const rev = await getRevenueMesUsd(appkit);
      if (rev === null || !Number.isFinite(rev)) {
        return { disponible: false, texto: 'No disponible: sin datos de revenue.', fuente: 'gold.flights' };
      }
      return {
        disponible: true,
        texto: `El revenue total de la red en los ultimos 30 dias volados es ${money(rev)}.`,
        fuente: 'gold.flights',
        datos: { revenueUsd: rev },
      };
    }

    // Ocupacion promedio de la red.
    if (qlow.includes('load factor') || qlow.includes('ocupaci')) {
      const kpi = await getNetworkKpis(appkit);
      if (!kpi) return { disponible: false, texto: 'No disponible.', fuente: 'gold.flights' };
      return {
        disponible: true,
        texto: `El load factor promedio de la red es ${pct(kpi.loadFactorProm * 100, 1)} en los ultimos 30 dias volados.`,
        fuente: 'gold.flights',
        datos: { loadFactor: kpi.loadFactorProm },
      };
    }

    return {
      disponible: false,
      texto:
        'No disponible. Puedo responder sobre: cuales rutas subir o bajar de precio, ' +
        'ocupacion de una ruta (por ejemplo "ocupacion de BOG-MIA"), load factor de la red y revenue del mes.',
      fuente: 'ayuda',
    };
  }
}

// Hook DESHABILITADO para un espacio Genie. Se activaria con ASSISTANT_PROVIDER=genie
// y el plugin genie() habilitado. No se enciende en este despliegue.
export class GenieProviderStub implements AssistantProvider {
  readonly nombre = 'Genie (deshabilitado)';
  readonly modo = 'genie';
  ask(): Promise<AssistantAnswer> {
    return Promise.resolve({
      disponible: false,
      texto: 'Proveedor Genie deshabilitado en este despliegue. Se activa con ASSISTANT_PROVIDER=genie.',
      fuente: 'config',
    });
  }
}

// Hook DESHABILITADO para un endpoint de Model Serving (LLM). Se activaria con
// ASSISTANT_PROVIDER=serving y el plugin serving() habilitado.
export class ModelServingProviderStub implements AssistantProvider {
  readonly nombre = 'Model Serving (deshabilitado)';
  readonly modo = 'serving';
  ask(): Promise<AssistantAnswer> {
    return Promise.resolve({
      disponible: false,
      texto: 'Proveedor Model Serving deshabilitado en este despliegue. Se activa con ASSISTANT_PROVIDER=serving.',
      fuente: 'config',
    });
  }
}

export function buildAssistant(): AssistantProvider {
  const mode = (process.env.ASSISTANT_PROVIDER ?? 'demo').toLowerCase();
  if (mode === 'genie') return new GenieProviderStub();
  if (mode === 'serving') return new ModelServingProviderStub();
  return new DemoProvider();
}
