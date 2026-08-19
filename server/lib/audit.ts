import { AppKit } from './appkit';

// Toda mutacion de la app escribe un evento de auditoria. Un solo punto de entrada
// para no olvidarlo en ninguna ruta.
export async function audit(
  appkit: AppKit,
  actor: string,
  accion: string,
  entidad: string,
  entidadId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await appkit.lakebase.query(
    `INSERT INTO revops.audit_events (id, actor, accion, entidad, entidad_id, payload)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb)`,
    [actor, accion, entidad, entidadId, JSON.stringify(payload)],
  );
}
