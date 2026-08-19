import { num } from "../lib/appkit.js";
import { getRouteMetrics } from "../lib/gold.js";

//#region server/db/bootstrap.ts
const DDL = [
	`CREATE SCHEMA IF NOT EXISTS revops`,
	`CREATE TABLE IF NOT EXISTS revops.pricing_actions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     ruta_id text NOT NULL,
     cabina text NOT NULL,
     clase_tarifa text NOT NULL,
     tipo_accion text NOT NULL,
     tarifa_anterior_usd numeric,
     tarifa_nueva_usd numeric,
     delta_pct numeric,
     motivo text,
     estado text NOT NULL DEFAULT 'propuesta',
     analista text,
     aprobador text,
     created_at timestamptz NOT NULL DEFAULT now(),
     decided_at timestamptz,
     applied_at timestamptz
   )`,
	`CREATE TABLE IF NOT EXISTS revops.alerts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     ruta_id text NOT NULL,
     tipo_alerta text NOT NULL,
     severidad text NOT NULL,
     mensaje text,
     metrica text,
     valor numeric,
     umbral numeric,
     estado text NOT NULL DEFAULT 'abierta',
     created_at timestamptz NOT NULL DEFAULT now(),
     acknowledged_at timestamptz
   )`,
	`CREATE TABLE IF NOT EXISTS revops.audit_events (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     actor text,
     accion text,
     entidad text,
     entidad_id text,
     payload jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`
];
const PCT = (v, d = 0) => `${v.toFixed(d)}%`;
function deriveAlerts(metrics) {
	const out = [];
	for (const m of metrics) {
		if (m.ocupacion >= .85 && m.brechaPct <= -5) out.push({
			rutaId: m.rutaId,
			tipo: "precio_bajo_mercado",
			severidad: "alta",
			mensaje: `${m.rutaId} va casi llena (ocupacion ${PCT(m.ocupacion * 100)}) y esta ${PCT(Math.abs(m.brechaPct), 1)} por debajo del mercado. Deja revenue sobre la mesa.`,
			metrica: "brecha_pct",
			valor: Math.round(m.brechaPct * 10) / 10,
			umbral: -5
		});
		else if (m.ocupacion <= .65 && m.brechaPct >= 5) out.push({
			rutaId: m.rutaId,
			tipo: "precio_sobre_mercado",
			severidad: "media",
			mensaje: `${m.rutaId} va floja (ocupacion ${PCT(m.ocupacion * 100)}) y esta ${PCT(m.brechaPct, 1)} por encima del mercado. El precio esta frenando la demanda.`,
			metrica: "brecha_pct",
			valor: Math.round(m.brechaPct * 10) / 10,
			umbral: 5
		});
		if (Number.isFinite(m.ocupacion) && m.ocupacion < .62) out.push({
			rutaId: m.rutaId,
			tipo: "ocupacion_baja",
			severidad: "media",
			mensaje: `Ocupacion baja en ${m.rutaId}: ${PCT(m.ocupacion * 100, 1)} en los ultimos 30 dias volados.`,
			metrica: "ocupacion",
			valor: Math.round(m.ocupacion * 1e3) / 1e3,
			umbral: .62
		});
		if (Number.isFinite(m.indiceDemanda) && (m.indiceDemanda >= 1.4 || m.indiceDemanda <= .7)) out.push({
			rutaId: m.rutaId,
			tipo: "demanda_atipica",
			severidad: "baja",
			mensaje: `Demanda atipica en ${m.rutaId}: indice ${m.indiceDemanda.toFixed(2)} (linea base 1.0).`,
			metrica: "indice_demanda",
			valor: Math.round(m.indiceDemanda * 100) / 100,
			umbral: m.indiceDemanda >= 1.4 ? 1.4 : .7
		});
	}
	return out;
}
const SEED_PRICING = [
	[
		"BOG-MIA",
		"Economy",
		"Standard",
		"SUBIR",
		340,
		367,
		7.9,
		"Ruta casi llena y por debajo del mercado.",
		"aplicada",
		"ana.torres",
		"jefe.rm"
	],
	[
		"BOG-MDE",
		"Economy",
		"Standard",
		"SUBIR",
		95,
		102,
		7.4,
		"Ocupacion alta con brecha bajo mercado.",
		"aprobada",
		"carlos.pena",
		"jefe.rm"
	],
	[
		"BOG-SCL",
		"Economy",
		"Standard",
		"BAJAR",
		520,
		468,
		-10,
		"Ruta floja y cara frente a competidores.",
		"propuesta",
		"ana.torres",
		""
	],
	[
		"BOG-GRU",
		"Economy",
		"Standard",
		"BAJAR",
		540,
		491,
		-9.1,
		"Ocupacion baja sostenida, precio por encima del mercado.",
		"propuesta",
		"lucia.mora",
		""
	],
	[
		"BOG-CTG",
		"Economy",
		"Standard",
		"SUBIR",
		120,
		129,
		7.5,
		"Alta demanda domestica, margen para subir.",
		"rechazada",
		"carlos.pena",
		"jefe.rm"
	],
	[
		"BOG-CUN",
		"Economy",
		"Standard",
		"MANTENER",
		300,
		300,
		0,
		"Brecha dentro de umbral, sin accion.",
		"propuesta",
		"lucia.mora",
		""
	]
];
async function bootstrapLakebase(appkit) {
	const result = {
		schemaOk: false,
		pricingSeeded: 0,
		alertsSeeded: 0,
		alertsSource: "none"
	};
	try {
		for (const stmt of DDL) await appkit.lakebase.query(stmt);
		result.schemaOk = true;
	} catch (err) {
		result.error = err.message;
		return result;
	}
	try {
		const { rows: pr } = await appkit.lakebase.query("SELECT COUNT(*)::text AS c FROM revops.pricing_actions");
		if (Number(pr[0]?.c ?? "0") === 0) for (const s of SEED_PRICING) {
			const [ruta, cabina, clase, tipo, ant, nueva, delta, motivo, estado, analista, aprobador] = s;
			const decided = estado === "aprobada" || estado === "rechazada" || estado === "aplicada" ? "now()" : "NULL";
			const applied = estado === "aplicada" ? "now()" : "NULL";
			await appkit.lakebase.query(`INSERT INTO revops.pricing_actions
             (id, ruta_id, cabina, clase_tarifa, tipo_accion, tarifa_anterior_usd, tarifa_nueva_usd, delta_pct, motivo, estado, analista, aprobador, decided_at, applied_at)
           VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, ${decided}, ${applied})`, [
				ruta,
				cabina,
				clase,
				tipo,
				ant,
				nueva,
				delta,
				motivo,
				estado,
				analista,
				aprobador || null
			]);
			result.pricingSeeded += 1;
		}
	} catch (err) {
		result.error = `pricing seed: ${err.message}`;
	}
	try {
		const { rows: ar } = await appkit.lakebase.query("SELECT COUNT(*)::text AS c FROM revops.alerts");
		if (Number(ar[0]?.c ?? "0") === 0) {
			let candidates = [];
			try {
				candidates = deriveAlerts((await getRouteMetrics(appkit)).map((m) => ({
					rutaId: m.rutaId,
					ocupacion: num(m.ocupacion),
					brechaPct: num(m.brechaPct),
					indiceDemanda: num(m.indiceDemanda)
				})));
				result.alertsSource = "gold";
			} catch {
				candidates = [{
					rutaId: "BOG-MIA",
					tipo: "precio_bajo_mercado",
					severidad: "alta",
					mensaje: "BOG-MIA por debajo del mercado con alta ocupacion.",
					metrica: "brecha_pct",
					valor: -13,
					umbral: -5
				}, {
					rutaId: "BOG-SCL",
					tipo: "ocupacion_baja",
					severidad: "media",
					mensaje: "Ocupacion baja sostenida en BOG-SCL.",
					metrica: "ocupacion",
					valor: .54,
					umbral: .62
				}];
				result.alertsSource = "fallback";
			}
			for (const c of candidates) {
				await appkit.lakebase.query(`INSERT INTO revops.alerts (id, ruta_id, tipo_alerta, severidad, mensaje, metrica, valor, umbral)
           VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7)`, [
					c.rutaId,
					c.tipo,
					c.severidad,
					c.mensaje,
					c.metrica,
					c.valor,
					c.umbral
				]);
				result.alertsSeeded += 1;
			}
		}
	} catch (err) {
		result.error = `alerts seed: ${err.message}`;
	}
	return result;
}

//#endregion
export { bootstrapLakebase, deriveAlerts };