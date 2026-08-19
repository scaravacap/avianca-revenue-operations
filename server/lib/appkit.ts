import type { Application } from 'express';
import type { QueryResult, QueryResultRow } from 'pg';

// Fila cruda que devuelve el warehouse via el plugin analytics.
export type GoldRow = Record<string, unknown>;

// Marcador de parametro SQL producido por sql.string()/sql.int()/etc.
export type SqlParam = unknown;

// Forma minima del objeto AppKit que usan nuestras rutas y librerias.
// El plugin analytics ejecuta SQL contra el SQL Warehouse con el Service
// Principal; lakebase ejecuta SQL contra Postgres. server.extend registra
// rutas Express adicionales.
export interface AppKit {
  analytics: {
    query(
      query: string,
      parameters?: Record<string, SqlParam>,
      formatParameters?: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<{ data?: GoldRow[] } & Record<string, unknown>>;
  };
  lakebase: {
    query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<T>>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

// El objeto que AppKit entrega en onPluginsReady expone los plugins con tipos
// mas ricos que este subconjunto estructural. Lo estrechamos con una sola
// asercion (pasando por object) para no acoplar el server a tipos internos del
// paquete cliente y sin recurrir a doble asercion.
export function toAppKit(app: object): AppKit {
  return app as AppKit;
}

// Normaliza la respuesta de analytics.query a un arreglo de filas.
export function rows(result: { data?: GoldRow[] } | undefined): GoldRow[] {
  return result?.data ?? [];
}

// Coercion segura a numero (el warehouse a veces serializa numeros como texto).
export function num(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}
