// Motor de reglas de pricing. Es transparente a proposito: no hay ML oculto.
// Vive detras de la interfaz PricingEngine para que manana un modelo servido
// (Model Serving) pueda reemplazarlo sin tocar las rutas ni la UI.

export type Accion = 'SUBIR' | 'BAJAR' | 'MANTENER';

export interface PricingInputs {
  rutaId: string;
  ocupacion: number; // promedio de load factor, ultimos 30 dias volados (0..1)
  tarifaPropia: number; // Economy Standard, USD
  compMediana: number; // mediana de competidores, USD
  indiceDemanda: number; // indice de demanda reciente (1.0 = linea base)
  forecastOcupacion: number; // ocupacion proyectada (0..1)
}

export interface PricingRecommendation {
  accion: Accion;
  deltaPct: number; // variacion sugerida sobre la tarifa propia
  tarifaSugeridaUsd: number;
  brechaPct: number; // (propia - competidor) / competidor * 100
  motivo: string; // explicacion legible con los insumos usados
  inputs: PricingInputs;
}

export interface SimulationInputs {
  tarifaPropia: number;
  ocupacion: number;
  revenueBaseUsd: number; // revenue del periodo de referencia (30 dias volados)
  priceChangePct: number; // palanca del usuario
  elasticidad: number; // default 1.2 en Economy
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const money = (v: number) => `USD ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (v: number, dec = 0) => `${v.toFixed(dec)}%`;

export interface PricingEngine {
  readonly nombre: string;
  recommend(inputs: PricingInputs): PricingRecommendation;
  simulate(inputs: SimulationInputs): SimulationResult;
}

export class RuleBasedPricingEngine implements PricingEngine {
  readonly nombre = 'Motor de reglas transparente v1';

  recommend(inputs: PricingInputs): PricingRecommendation {
    const { ocupacion, tarifaPropia, compMediana, indiceDemanda } = inputs;
    const brechaPct = compMediana > 0 ? ((tarifaPropia - compMediana) / compMediana) * 100 : 0;
    const ocupTxt = pct(ocupacion * 100);
    const brechaAbs = Math.abs(brechaPct);

    if (ocupacion >= 0.85 && brechaPct <= -5) {
      // Vuelo casi lleno y estamos por debajo del mercado: hay espacio para subir.
      const delta = clamp(Math.round(6 + (brechaAbs - 5) * 0.4 + (ocupacion - 0.85) * 20), 6, 10);
      const tarifaSugerida = Math.round(tarifaPropia * (1 + delta / 100) * 100) / 100;
      const motivo =
        `Ocupacion ${ocupTxt} (>= 85%) y estamos ${pct(brechaAbs)} por debajo de la mediana del ` +
        `mercado (${money(tarifaPropia)} vs ${money(compMediana)}). Demanda reciente en indice ` +
        `${indiceDemanda.toFixed(2)}. Recomiendo subir ${pct(delta)} a ${money(tarifaSugerida)}.`;
      return { accion: 'SUBIR', deltaPct: delta, tarifaSugeridaUsd: tarifaSugerida, brechaPct, motivo, inputs };
    }

    if (ocupacion <= 0.65 && brechaPct >= 5) {
      // Vuelo flojo y estamos caros: bajar para recuperar demanda.
      const delta = clamp(Math.round(8 + (brechaPct - 5) * 0.3 + (0.65 - ocupacion) * 20), 8, 12);
      const tarifaSugerida = Math.round(tarifaPropia * (1 - delta / 100) * 100) / 100;
      const motivo =
        `Ocupacion ${ocupTxt} (<= 65%) y estamos ${pct(brechaPct)} por encima de la mediana del ` +
        `mercado (${money(tarifaPropia)} vs ${money(compMediana)}). Demanda reciente en indice ` +
        `${indiceDemanda.toFixed(2)}. Recomiendo bajar ${pct(delta)} a ${money(tarifaSugerida)}.`;
      return { accion: 'BAJAR', deltaPct: -delta, tarifaSugeridaUsd: tarifaSugerida, brechaPct, motivo, inputs };
    }

    const motivo =
      `Ocupacion ${ocupTxt} y brecha de ${pct(brechaPct, 1)} contra la mediana del mercado ` +
      `(${money(tarifaPropia)} vs ${money(compMediana)}). Ni la ocupacion ni la brecha cruzan los ` +
      `umbrales de accion. Mantengo la tarifa en ${money(tarifaPropia)}.`;
    return { accion: 'MANTENER', deltaPct: 0, tarifaSugeridaUsd: tarifaPropia, brechaPct, motivo, inputs };
  }

  simulate(inputs: SimulationInputs): SimulationResult {
    const { tarifaPropia, ocupacion, revenueBaseUsd, priceChangePct, elasticidad } = inputs;
    // Elasticidad simple: un +1% de precio mueve la demanda en -elasticidad %.
    const demandaChangePct = -elasticidad * priceChangePct;
    const ocupacionProyectada = clamp(ocupacion * (1 + demandaChangePct / 100), 0, 1);
    const tarifaProyectada = Math.round(tarifaPropia * (1 + priceChangePct / 100) * 100) / 100;

    const revActualProxy = tarifaPropia * ocupacion;
    const revProyProxy = tarifaProyectada * ocupacionProyectada;
    const revenueDeltaPct = revActualProxy > 0 ? ((revProyProxy - revActualProxy) / revActualProxy) * 100 : 0;
    const revenueProyectadoUsd = Math.round(revenueBaseUsd * (1 + revenueDeltaPct / 100) * 100) / 100;
    const revenueDeltaUsd = Math.round((revenueProyectadoUsd - revenueBaseUsd) * 100) / 100;

    const formula =
      `demanda% = -elasticidad (${elasticidad}) x precio% (${pct(priceChangePct)}) = ${pct(demandaChangePct, 1)}; ` +
      `ocupacion proyectada = ${pct(ocupacion * 100)} x (1 + demanda%) = ${pct(ocupacionProyectada * 100, 1)}; ` +
      `revenue proyectado = base x (tarifa nueva x ocupacion nueva) / (tarifa actual x ocupacion actual).`;

    return {
      priceChangePct,
      elasticidad,
      demandaChangePct: Math.round(demandaChangePct * 10) / 10,
      ocupacionProyectada: Math.round(ocupacionProyectada * 10000) / 10000,
      tarifaProyectadaUsd: tarifaProyectada,
      revenueProyectadoUsd,
      revenueDeltaPct: Math.round(revenueDeltaPct * 10) / 10,
      revenueDeltaUsd,
      formula,
    };
  }
}

export const pricingEngine: PricingEngine = new RuleBasedPricingEngine();
