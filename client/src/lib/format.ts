// Formateo consistente. Todo es USD.

// El SQL Warehouse serializa DOUBLE y BIGINT como texto, aunque los tipos generados
// por AppKit los declaren como number. Por eso todo formateador coerciona primero:
// asumir number en runtime rompe la pagina con "toFixed is not a function".
type Numeric = number | string | null | undefined;

export function toNum(value: Numeric): number {
  if (value === null || value === undefined || value === '') return NaN;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function usd(value: Numeric, dec = 0): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export function usdCompact(value: Numeric): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `USD ${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `USD ${(n / 1_000).toFixed(1)}K`;
  return `USD ${n.toFixed(0)}`;
}

export function pct(value: Numeric, dec = 1): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  return `${n.toFixed(dec)}%`;
}

export function pctFromRatio(value: Numeric, dec = 1): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  return `${(n * 100).toFixed(dec)}%`;
}

export function signed(value: Numeric, dec = 1): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(dec)}`;
}

export function intFmt(value: Numeric): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  return n.toLocaleString('en-US');
}

export function dec(value: Numeric, places = 2): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return 'No disponible';
  return n.toFixed(places);
}

export function fecha(value: string | null | undefined): string {
  if (!value) return 'No disponible';
  return value.slice(0, 10);
}
