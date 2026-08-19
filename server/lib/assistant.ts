import { AppKit } from './appkit';
import { getNetworkKpis, getRevenueMesUsd, getRouteInputs, getRouteMetrics, RouteMetric } from './gold';

// Asistente conversacional detras de una interfaz desacoplada, con dos proveedores
// activos:
//
// - GenieProvider: manda la pregunta al espacio Genie sobre las tablas gold. Se usa
//   cuando el despliegue define DATABRICKS_GENIE_SPACE_ID. Si Genie falla, cae al demo.
// - DemoProvider: responde de forma determinista con SQL predefinido sobre gold. Si
//   no hay dato, responde "No disponible" en vez de inventar.
//
// Model Serving queda documentado como hook y se activa con ASSISTANT_PROVIDER=serving.

export interface AssistantAnswer {
  disponible: boolean;
  texto: string;
  fuente: string;
  sql?: string;
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

// Proveedor Genie. Manda la pregunta al espacio Genie configurado, que traduce a
// SQL sobre las tablas gold y responde en lenguaje natural. Si Genie falla o no
// devuelve nada util, cae al proveedor demo en vez de dejar al usuario sin
// respuesta.
export class GenieProvider implements AssistantProvider {
  readonly nombre = 'Genie (espacio Avianca Revenue Operations)';
  readonly modo = 'genie';
  private readonly respaldo = new DemoProvider();

  async ask(pregunta: string, appkit: AppKit): Promise<AssistantAnswer> {
    if (!appkit.genie) return this.respaldo.ask(pregunta, appkit);

    let texto = '';
    // Genie suele devolver dos adjuntos: una parafrasis de la pregunta (description)
    // y la respuesta con cifras (text). Nos quedamos con la respuesta y solo caemos
    // a la parafrasis si no vino texto.
    let parafrasis = '';
    let sql: string | undefined;
    let tabla: { columnas: string[]; filas: (string | null)[][] } | undefined;
    let error: string | undefined;

    try {
      for await (const ev of appkit.genie.sendMessage('default', pregunta, undefined, { timeout: 120000 })) {
        if (ev.type === 'error') {
          error = ev.error;
        } else if (ev.type === 'message_result') {
          error = error ?? ev.message?.error;
          for (const att of ev.message?.attachments ?? []) {
            if (att.text?.content) texto += (texto ? '\n\n' : '') + att.text.content;
            if (att.query?.description) parafrasis = att.query.description;
            if (att.query?.query) sql = att.query.query;
          }
          if (!texto && ev.message?.content) texto = ev.message.content;
          if (!texto) texto = parafrasis;
        } else if (ev.type === 'query_result') {
          const cols = ev.data?.manifest?.schema?.columns?.map((c) => c.name) ?? [];
          const filas = (ev.data?.result?.data_array ?? []).slice(0, 20);
          if (cols.length > 0) tabla = { columnas: cols, filas };
        }
      }
    } catch (err) {
      error = (err as Error).message;
    }

    if (error && !texto) {
      const fb = await this.respaldo.ask(pregunta, appkit);
      return { ...fb, fuente: `${fb.fuente} (Genie no disponible: ${error})` };
    }
    if (!texto && !tabla) return this.respaldo.ask(pregunta, appkit);

    return {
      disponible: true,
      texto: texto || 'Genie devolvio la tabla de resultados sin texto.',
      fuente: 'Genie sobre avianca_revenue_operations.gold',
      sql,
      datos: tabla,
    };
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

// Seleccion de proveedor. Por defecto es 'auto': usa Genie si el despliegue tiene
// un espacio configurado (DATABRICKS_GENIE_SPACE_ID) y demo si no. Asi el mismo
// codigo corre con Genie donde hay espacio y sin el donde no lo hay.
export function buildAssistant(): AssistantProvider {
  const mode = (process.env.ASSISTANT_PROVIDER ?? 'auto').toLowerCase();
  if (mode === 'demo') return new DemoProvider();
  if (mode === 'serving') return new ModelServingProviderStub();
  if (mode === 'genie') return new GenieProvider();
  return process.env.DATABRICKS_GENIE_SPACE_ID ? new GenieProvider() : new DemoProvider();
}
