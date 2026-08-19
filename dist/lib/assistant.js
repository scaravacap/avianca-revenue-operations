import { getNetworkKpis, getRevenueMesUsd, getRouteInputs, getRouteMetrics } from "./gold.js";

//#region server/lib/assistant.ts
const money = (v) => `USD ${Math.round(v).toLocaleString("en-US")}`;
const pct = (v, d = 0) => `${v.toFixed(d)}%`;
function accionFor(m) {
	if (m.ocupacion >= .85 && m.brechaPct <= -5) return "SUBIR";
	if (m.ocupacion <= .65 && m.brechaPct >= 5) return "BAJAR";
	return "MANTENER";
}
const RUTA_RE = /\b([A-Z]{3}-[A-Z]{3})\b/;
var DemoProvider = class {
	constructor() {
		this.nombre = "Asistente demo (SQL determinista sobre gold)";
		this.modo = "demo";
	}
	async ask(pregunta, appkit) {
		const q = pregunta.trim();
		const qlow = q.toLowerCase();
		const rutaMatch = q.toUpperCase().match(RUTA_RE);
		if (rutaMatch && qlow.includes("ocupaci")) {
			const ruta = rutaMatch[1];
			const inp = await getRouteInputs(appkit, ruta);
			if (!inp || !Number.isFinite(inp.ocupacion)) return {
				disponible: false,
				texto: `No disponible: no encuentro ocupacion para ${ruta}.`,
				fuente: "gold.flights"
			};
			return {
				disponible: true,
				texto: `La ocupacion de ${ruta} en los ultimos 30 dias volados es ${pct(inp.ocupacion * 100, 1)}.`,
				fuente: "gold.flights",
				datos: {
					ruta,
					ocupacion: inp.ocupacion
				}
			};
		}
		if (qlow.includes("subir") || qlow.includes("bajar")) {
			const objetivo = qlow.includes("bajar") ? "BAJAR" : "SUBIR";
			const hit = (await getRouteMetrics(appkit)).filter((m) => accionFor(m) === objetivo);
			if (hit.length === 0) return {
				disponible: true,
				texto: `Ninguna ruta cumple hoy los umbrales para ${objetivo}.`,
				fuente: "gold"
			};
			return {
				disponible: true,
				texto: `Rutas con recomendacion ${objetivo}: ${hit.map((m) => `${m.rutaId} (ocupacion ${pct(m.ocupacion * 100)}, brecha ${pct(m.brechaPct, 1)})`).join("; ")}.`,
				fuente: "gold.flights + gold.current_fares + gold.competitor_fares",
				datos: hit.map((m) => m.rutaId)
			};
		}
		if (qlow.includes("revenue") || qlow.includes("ingreso")) {
			const rev = await getRevenueMesUsd(appkit);
			if (rev === null || !Number.isFinite(rev)) return {
				disponible: false,
				texto: "No disponible: sin datos de revenue.",
				fuente: "gold.flights"
			};
			return {
				disponible: true,
				texto: `El revenue total de la red en los ultimos 30 dias volados es ${money(rev)}.`,
				fuente: "gold.flights",
				datos: { revenueUsd: rev }
			};
		}
		if (qlow.includes("load factor") || qlow.includes("ocupaci")) {
			const kpi = await getNetworkKpis(appkit);
			if (!kpi) return {
				disponible: false,
				texto: "No disponible.",
				fuente: "gold.flights"
			};
			return {
				disponible: true,
				texto: `El load factor promedio de la red es ${pct(kpi.loadFactorProm * 100, 1)} en los ultimos 30 dias volados.`,
				fuente: "gold.flights",
				datos: { loadFactor: kpi.loadFactorProm }
			};
		}
		return {
			disponible: false,
			texto: "No disponible. Puedo responder sobre: cuales rutas subir o bajar de precio, ocupacion de una ruta (por ejemplo \"ocupacion de BOG-MIA\"), load factor de la red y revenue del mes.",
			fuente: "ayuda"
		};
	}
};
var GenieProviderStub = class {
	constructor() {
		this.nombre = "Genie (deshabilitado)";
		this.modo = "genie";
	}
	ask() {
		return Promise.resolve({
			disponible: false,
			texto: "Proveedor Genie deshabilitado en este despliegue. Se activa con ASSISTANT_PROVIDER=genie.",
			fuente: "config"
		});
	}
};
var ModelServingProviderStub = class {
	constructor() {
		this.nombre = "Model Serving (deshabilitado)";
		this.modo = "serving";
	}
	ask() {
		return Promise.resolve({
			disponible: false,
			texto: "Proveedor Model Serving deshabilitado en este despliegue. Se activa con ASSISTANT_PROVIDER=serving.",
			fuente: "config"
		});
	}
};
function buildAssistant() {
	const mode = (process.env.ASSISTANT_PROVIDER ?? "demo").toLowerCase();
	if (mode === "genie") return new GenieProviderStub();
	if (mode === "serving") return new ModelServingProviderStub();
	return new DemoProvider();
}

//#endregion
export { buildAssistant };