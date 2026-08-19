//#region server/lib/pricing-engine.ts
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const money = (v) => `USD ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v, dec = 0) => `${v.toFixed(dec)}%`;
var RuleBasedPricingEngine = class {
	constructor() {
		this.nombre = "Motor de reglas transparente v1";
	}
	recommend(inputs) {
		const { ocupacion, tarifaPropia, compMediana, indiceDemanda } = inputs;
		const brechaPct = compMediana > 0 ? (tarifaPropia - compMediana) / compMediana * 100 : 0;
		const ocupTxt = pct(ocupacion * 100);
		const brechaAbs = Math.abs(brechaPct);
		if (ocupacion >= .85 && brechaPct <= -5) {
			const delta = clamp(Math.round(6 + (brechaAbs - 5) * .4 + (ocupacion - .85) * 20), 6, 10);
			const tarifaSugerida = Math.round(tarifaPropia * (1 + delta / 100) * 100) / 100;
			return {
				accion: "SUBIR",
				deltaPct: delta,
				tarifaSugeridaUsd: tarifaSugerida,
				brechaPct,
				motivo: `Ocupacion ${ocupTxt} (>= 85%) y estamos ${pct(brechaAbs)} por debajo de la mediana del mercado (${money(tarifaPropia)} vs ${money(compMediana)}). Demanda reciente en indice ${indiceDemanda.toFixed(2)}. Recomiendo subir ${pct(delta)} a ${money(tarifaSugerida)}.`,
				inputs
			};
		}
		if (ocupacion <= .65 && brechaPct >= 5) {
			const delta = clamp(Math.round(8 + (brechaPct - 5) * .3 + (.65 - ocupacion) * 20), 8, 12);
			const tarifaSugerida = Math.round(tarifaPropia * (1 - delta / 100) * 100) / 100;
			const motivo = `Ocupacion ${ocupTxt} (<= 65%) y estamos ${pct(brechaPct)} por encima de la mediana del mercado (${money(tarifaPropia)} vs ${money(compMediana)}). Demanda reciente en indice ${indiceDemanda.toFixed(2)}. Recomiendo bajar ${pct(delta)} a ${money(tarifaSugerida)}.`;
			return {
				accion: "BAJAR",
				deltaPct: -delta,
				tarifaSugeridaUsd: tarifaSugerida,
				brechaPct,
				motivo,
				inputs
			};
		}
		return {
			accion: "MANTENER",
			deltaPct: 0,
			tarifaSugeridaUsd: tarifaPropia,
			brechaPct,
			motivo: `Ocupacion ${ocupTxt} y brecha de ${pct(brechaPct, 1)} contra la mediana del mercado (${money(tarifaPropia)} vs ${money(compMediana)}). Ni la ocupacion ni la brecha cruzan los umbrales de accion. Mantengo la tarifa en ${money(tarifaPropia)}.`,
			inputs
		};
	}
	simulate(inputs) {
		const { tarifaPropia, ocupacion, revenueBaseUsd, priceChangePct, elasticidad } = inputs;
		const demandaChangePct = -elasticidad * priceChangePct;
		const ocupacionProyectada = clamp(ocupacion * (1 + demandaChangePct / 100), 0, 1);
		const tarifaProyectada = Math.round(tarifaPropia * (1 + priceChangePct / 100) * 100) / 100;
		const revActualProxy = tarifaPropia * ocupacion;
		const revProyProxy = tarifaProyectada * ocupacionProyectada;
		const revenueDeltaPct = revActualProxy > 0 ? (revProyProxy - revActualProxy) / revActualProxy * 100 : 0;
		const revenueProyectadoUsd = Math.round(revenueBaseUsd * (1 + revenueDeltaPct / 100) * 100) / 100;
		const revenueDeltaUsd = Math.round((revenueProyectadoUsd - revenueBaseUsd) * 100) / 100;
		const formula = `demanda% = -elasticidad (${elasticidad}) x precio% (${pct(priceChangePct)}) = ${pct(demandaChangePct, 1)}; ocupacion proyectada = ${pct(ocupacion * 100)} x (1 + demanda%) = ${pct(ocupacionProyectada * 100, 1)}; revenue proyectado = base x (tarifa nueva x ocupacion nueva) / (tarifa actual x ocupacion actual).`;
		return {
			priceChangePct,
			elasticidad,
			demandaChangePct: Math.round(demandaChangePct * 10) / 10,
			ocupacionProyectada: Math.round(ocupacionProyectada * 1e4) / 1e4,
			tarifaProyectadaUsd: tarifaProyectada,
			revenueProyectadoUsd,
			revenueDeltaPct: Math.round(revenueDeltaPct * 10) / 10,
			revenueDeltaUsd,
			formula
		};
	}
};
const pricingEngine = new RuleBasedPricingEngine();

//#endregion
export { pricingEngine };