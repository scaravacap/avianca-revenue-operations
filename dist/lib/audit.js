//#region server/lib/audit.ts
async function audit(appkit, actor, accion, entidad, entidadId, payload = {}) {
	await appkit.lakebase.query(`INSERT INTO revops.audit_events (id, actor, accion, entidad, entidad_id, payload)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb)`, [
		actor,
		accion,
		entidad,
		entidadId,
		JSON.stringify(payload)
	]);
}

//#endregion
export { audit };