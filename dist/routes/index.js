import { getNetworkKpis, getRouteInputs, getRouteMetrics } from "../lib/gold.js";
import { deriveAlerts } from "../db/bootstrap.js";
import { audit } from "../lib/audit.js";
import { pricingEngine } from "../lib/pricing-engine.js";
import { buildAssistant } from "../lib/assistant.js";
import { z } from "zod";

//#region server/routes/index.ts
const assistant = buildAssistant();
const RUTA = z.string().regex(/^[A-Z]{3}-[A-Z]{3}$/);
function actorOf(req) {
	return req.header("x-forwarded-email") || req.header("x-forwarded-user") || "analista.demo";
}
const CreateActionBody = z.object({
	rutaId: RUTA,
	cabina: z.string().min(1),
	claseTarifa: z.string().min(1),
	tipoAccion: z.enum([
		"SUBIR",
		"BAJAR",
		"MANTENER",
		"INVENTARIO"
	]),
	tarifaAnteriorUsd: z.number().nonnegative(),
	tarifaNuevaUsd: z.number().nonnegative(),
	deltaPct: z.number(),
	motivo: z.string().min(1)
});
const DecideActionBody = z.object({
	accion: z.enum([
		"aprobar",
		"rechazar",
		"aplicar"
	]),
	aprobador: z.string().optional()
});
const SimulateBody = z.object({
	rutaId: RUTA,
	priceChangePct: z.number().min(-40).max(40),
	elasticidad: z.number().min(.1).max(3).optional()
});
const AlertDecisionBody = z.object({ accion: z.enum(["reconocer", "cerrar"]) });
const AssistantBody = z.object({ pregunta: z.string().min(1).max(500) });
function registerRoutes(appkit) {
	appkit.server.extend((app) => {
		app.get("/api/whoami", (req, res) => {
			res.json({
				email: actorOf(req),
				ejecutaComo: "service principal de la app",
				onBehalfOf: false,
				nota: "Las consultas a datos corren con el Service Principal de la app, no con tu identidad."
			});
		});
		app.get("/api/summary", async (_req, res) => {
			try {
				const kpi = await getNetworkKpis(appkit);
				const { rows: al } = await appkit.lakebase.query("SELECT COUNT(*)::text AS c FROM revops.alerts WHERE estado = 'abierta'");
				const { rows: ac } = await appkit.lakebase.query("SELECT COUNT(*)::text AS c FROM revops.pricing_actions WHERE estado = 'propuesta'");
				res.json({
					kpi,
					alertasAbiertas: Number(al[0]?.c ?? "0"),
					accionesPendientes: Number(ac[0]?.c ?? "0"),
					generadoEn: (/* @__PURE__ */ new Date()).toISOString()
				});
			} catch (err) {
				res.status(500).json({ error: `No pude construir el resumen: ${err.message}` });
			}
		});
		app.get("/api/pricing/recommendation/:rutaId", async (req, res) => {
			const parsed = RUTA.safeParse(req.params.rutaId);
			if (!parsed.success) {
				res.status(400).json({ error: "ruta_id invalido" });
				return;
			}
			try {
				const inputs = await getRouteInputs(appkit, parsed.data);
				if (!inputs) {
					res.status(404).json({ error: `Sin datos para ${parsed.data}` });
					return;
				}
				const rec = pricingEngine.recommend({
					rutaId: inputs.rutaId,
					ocupacion: inputs.ocupacion,
					tarifaPropia: inputs.tarifaPropia,
					compMediana: inputs.compMediana,
					indiceDemanda: inputs.indiceDemanda,
					forecastOcupacion: inputs.forecastOcupacion
				});
				res.json({
					motor: pricingEngine.nombre,
					inputs,
					recomendacion: rec
				});
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.post("/api/pricing/simulate", async (req, res) => {
			const parsed = SimulateBody.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({
					error: "Cuerpo invalido",
					detalle: parsed.error.flatten()
				});
				return;
			}
			try {
				const inputs = await getRouteInputs(appkit, parsed.data.rutaId);
				if (!inputs) {
					res.status(404).json({ error: `Sin datos para ${parsed.data.rutaId}` });
					return;
				}
				const sim = pricingEngine.simulate({
					tarifaPropia: inputs.tarifaPropia,
					ocupacion: inputs.ocupacion,
					revenueBaseUsd: inputs.revenue30Usd,
					priceChangePct: parsed.data.priceChangePct,
					elasticidad: parsed.data.elasticidad ?? 1.2
				});
				res.json({
					ruta: parsed.data.rutaId,
					base: {
						tarifaPropia: inputs.tarifaPropia,
						ocupacion: inputs.ocupacion,
						revenue30Usd: inputs.revenue30Usd
					},
					simulacion: sim
				});
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.get("/api/pricing/actions", async (req, res) => {
			try {
				const estado = typeof req.query.estado === "string" ? req.query.estado : null;
				const sql = estado ? `SELECT * FROM revops.pricing_actions WHERE estado = $1 ORDER BY created_at DESC` : `SELECT * FROM revops.pricing_actions ORDER BY created_at DESC`;
				const { rows } = await appkit.lakebase.query(sql, estado ? [estado] : []);
				res.json(rows);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.post("/api/pricing/actions", async (req, res) => {
			const parsed = CreateActionBody.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({
					error: "Cuerpo invalido",
					detalle: parsed.error.flatten()
				});
				return;
			}
			const b = parsed.data;
			const actor = actorOf(req);
			try {
				const { rows } = await appkit.lakebase.query(`INSERT INTO revops.pricing_actions
             (id, ruta_id, cabina, clase_tarifa, tipo_accion, tarifa_anterior_usd, tarifa_nueva_usd, delta_pct, motivo, estado, analista)
           VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,'propuesta',$9)
           RETURNING *`, [
					b.rutaId,
					b.cabina,
					b.claseTarifa,
					b.tipoAccion,
					b.tarifaAnteriorUsd,
					b.tarifaNuevaUsd,
					b.deltaPct,
					b.motivo,
					actor
				]);
				const created = rows[0];
				await audit(appkit, actor, "crear_propuesta", "pricing_action", String(created.id), {
					ruta: b.rutaId,
					tipo: b.tipoAccion,
					delta: b.deltaPct
				});
				res.status(201).json(created);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.patch("/api/pricing/actions/:id", async (req, res) => {
			const id = z.string().uuid().safeParse(req.params.id);
			const parsed = DecideActionBody.safeParse(req.body);
			if (!id.success || !parsed.success) {
				res.status(400).json({ error: "Solicitud invalida" });
				return;
			}
			const actor = actorOf(req);
			const { accion, aprobador } = parsed.data;
			const target = {
				aprobar: {
					estado: "aprobada",
					ts: "decided_at"
				},
				rechazar: {
					estado: "rechazada",
					ts: "decided_at"
				},
				aplicar: {
					estado: "aplicada",
					ts: "applied_at"
				}
			}[accion];
			try {
				const { rows } = await appkit.lakebase.query(`UPDATE revops.pricing_actions
             SET estado = $1, ${target.ts} = now(), aprobador = COALESCE($2, aprobador)
           WHERE id = $3 RETURNING *`, [
					target.estado,
					aprobador ?? actor,
					id.data
				]);
				if (rows.length === 0) {
					res.status(404).json({ error: "Accion no encontrada" });
					return;
				}
				await audit(appkit, actor, `accion_${accion}`, "pricing_action", id.data, { estado: target.estado });
				res.json(rows[0]);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.get("/api/alerts", async (req, res) => {
			try {
				const estado = typeof req.query.estado === "string" ? req.query.estado : null;
				const sql = estado ? `SELECT * FROM revops.alerts WHERE estado = $1 ORDER BY created_at DESC` : `SELECT * FROM revops.alerts ORDER BY created_at DESC`;
				const { rows } = await appkit.lakebase.query(sql, estado ? [estado] : []);
				res.json(rows);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.post("/api/alerts/refresh", async (req, res) => {
			const actor = actorOf(req);
			try {
				const candidates = deriveAlerts(await getRouteMetrics(appkit));
				let insertadas = 0;
				for (const c of candidates) {
					const { rows } = await appkit.lakebase.query(`SELECT COUNT(*)::text AS c FROM revops.alerts WHERE ruta_id=$1 AND tipo_alerta=$2 AND estado='abierta'`, [c.rutaId, c.tipo]);
					if (Number(rows[0]?.c ?? "0") > 0) continue;
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
					insertadas += 1;
				}
				await audit(appkit, actor, "refrescar_alertas", "alert", "batch", {
					evaluadas: candidates.length,
					insertadas
				});
				res.json({
					evaluadas: candidates.length,
					insertadas
				});
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.patch("/api/alerts/:id", async (req, res) => {
			const id = z.string().uuid().safeParse(req.params.id);
			const parsed = AlertDecisionBody.safeParse(req.body);
			if (!id.success || !parsed.success) {
				res.status(400).json({ error: "Solicitud invalida" });
				return;
			}
			const actor = actorOf(req);
			const nuevoEstado = parsed.data.accion === "reconocer" ? "reconocida" : "cerrada";
			const setAck = parsed.data.accion === "reconocer" ? ", acknowledged_at = now()" : "";
			try {
				const { rows } = await appkit.lakebase.query(`UPDATE revops.alerts SET estado = $1${setAck} WHERE id = $2 RETURNING *`, [nuevoEstado, id.data]);
				if (rows.length === 0) {
					res.status(404).json({ error: "Alerta no encontrada" });
					return;
				}
				await audit(appkit, actor, `alerta_${parsed.data.accion}`, "alert", id.data, { estado: nuevoEstado });
				res.json(rows[0]);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.get("/api/audit", async (req, res) => {
			try {
				const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
				const { rows } = await appkit.lakebase.query(`SELECT * FROM revops.audit_events ORDER BY created_at DESC LIMIT $1`, [limit]);
				res.json(rows);
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
		app.get("/api/assistant/info", (_req, res) => {
			res.json({
				proveedor: assistant.nombre,
				modo: assistant.modo,
				espacioGenie: process.env.DATABRICKS_GENIE_SPACE_ID ?? null
			});
		});
		app.post("/api/assistant", async (req, res) => {
			const parsed = AssistantBody.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({ error: "Falta la pregunta" });
				return;
			}
			try {
				const answer = await assistant.ask(parsed.data.pregunta, appkit);
				res.json({
					proveedor: assistant.nombre,
					modo: assistant.modo,
					...answer
				});
			} catch (err) {
				res.status(500).json({ error: err.message });
			}
		});
	});
}

//#endregion
export { registerRoutes };