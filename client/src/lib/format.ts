// Formateo consistente. Todo es USD.

export function usd(value: number | null | undefined, dec = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  return `USD ${value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export function usdCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `USD ${(value / 1_000).toFixed(1)}K`;
  return `USD ${value.toFixed(0)}`;
}

export function pct(value: number | null | undefined, dec = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  return `${value.toFixed(dec)}%`;
}

export function pctFromRatio(value: number | null | undefined, dec = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  return `${(value * 100).toFixed(dec)}%`;
}

export function signed(value: number | null | undefined, dec = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  const s = value > 0 ? '+' : '';
  return `${s}${value.toFixed(dec)}`;
}

export function intFmt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No disponible';
  return value.toLocaleString('en-US');
}

export function fecha(value: string | null | undefined): string {
  if (!value) return 'No disponible';
  return value.slice(0, 10);
}
