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
var GenieProvider = class {
	constructor() {
		this.nombre = "Genie (espacio Avianca Revenue Operations)";
		this.modo = "genie";
		this.respaldo = new DemoProvider();
	}
	async ask(pregunta, appkit) {
		if (!appkit.genie) return this.respaldo.ask(pregunta, appkit);
		let texto = "";
		let parafrasis = "";
		let sql;
		let tabla;
		let error;
		try {
			for await (const ev of appkit.genie.sendMessage("default", pregunta, void 0, { timeout: 12e4 })) if (ev.type === "error") error = ev.error;
			else if (ev.type === "message_result") {
				error = error ?? ev.message?.error;
				for (const att of ev.message?.attachments ?? []) {
					if (att.text?.content) texto += (texto ? "\n\n" : "") + att.text.content;
					if (att.query?.description) parafrasis = att.query.description;
					if (att.query?.query) sql = att.query.query;
				}
				if (!texto && ev.message?.content) texto = ev.message.content;
				if (!texto) texto = parafrasis;
			} else if (ev.type === "query_result") {
				const cols = ev.data?.manifest?.schema?.columns?.map((c) => c.name) ?? [];
				const filas = (ev.data?.result?.data_array ?? []).slice(0, 20);
				if (cols.length > 0) tabla = {
					columnas: cols,
					filas
				};
			}
		} catch (err) {
			error = err.message;
		}
		if (error && !texto) {
			const fb = await this.respaldo.ask(pregunta, appkit);
			return {
				...fb,
				fuente: `${fb.fuente} (Genie no disponible: ${error})`
			};
		}
		if (!texto && !tabla) return this.respaldo.ask(pregunta, appkit);
		return {
			disponible: true,
			texto: texto || "Genie devolvio la tabla de resultados sin texto.",
			fuente: "Genie sobre avianca_revenue_operations.gold",
			sql,
			datos: tabla
		};
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
	const mode = (process.env.ASSISTANT_PROVIDER ?? "auto").toLowerCase();
	if (mode === "demo") return new DemoProvider();
	if (mode === "serving") return new ModelServingProviderStub();
	if (mode === "genie") return new GenieProvider();
	return process.env.DATABRICKS_GENIE_SPACE_ID ? new GenieProvider() : new DemoProvider();
}

//#endregion
export { buildAssistant };