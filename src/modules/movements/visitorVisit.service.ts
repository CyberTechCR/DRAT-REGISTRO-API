import { QueryTypes, Transaction } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';

export type ActiveVisitorVisit = {
  id: string;
  identification: string;
  name: string;
  reason: string;
  badgeCode: string;
  entryAt: Date;
  badgeReturnPending?: boolean;
};

export type VisitorIdentity = { identification: string; name: string };

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > maximum) {
    throw new ApiError(400, `${field} inválido`);
  }
  return value.trim();
}

export async function registerVisitorEntry(input: { identification: string; name: string; reason: string; badgeCode: string; userId: string }) {
  const identification = requiredText(input.identification, 'Identificación', 40).toUpperCase();
  const name = requiredText(input.name, 'Nombre', 160);
  const reason = requiredText(input.reason, 'Motivo de visita', 300);
  const badgeCode = requiredText(input.badgeCode, 'Código de gafete', 40).toUpperCase();
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const [validBadge] = await requireDatabase().query<{ id: string }>('SELECT id FROM nfc_tags WHERE code = :badgeCode AND active = TRUE AND employee_id IS NULL', { replacements: { badgeCode }, type: QueryTypes.SELECT, transaction });
    if (!validBadge) throw new ApiError(409, 'El TAG NFC no está activo o está asignado a un funcionario');
    const [occupiedBadge] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_visits WHERE badge_code = :badgeCode AND exit_at IS NULL', { replacements: { badgeCode }, type: QueryTypes.SELECT, transaction });
    if (occupiedBadge) throw new ApiError(409, 'El gafete seleccionado ya se encuentra asignado');
    const [visitor] = await requireDatabase().query<{ id: string }>(
      `INSERT INTO visitors (identification, name) VALUES (:identification, :name)
       ON CONFLICT (identification) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id`,
      { replacements: { identification, name }, type: QueryTypes.SELECT, transaction },
    );
    if (!visitor) throw new ApiError(500, 'No fue posible registrar la persona visitante');
    const [openVisit] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_visits WHERE visitor_id = :visitorId AND exit_at IS NULL', { replacements: { visitorId: visitor.id }, type: QueryTypes.SELECT, transaction });
    if (openVisit) throw new ApiError(409, 'La persona visitante ya figura dentro del plantel');
    const [visit] = await requireDatabase().query<ActiveVisitorVisit>(
      `INSERT INTO visitor_visits (visitor_id, reason, badge_code, entry_confirmed_by_user_id)
       VALUES (:visitorId, :reason, :badgeCode, :userId)
       RETURNING id, :identification AS identification, :name AS name, reason, badge_code AS "badgeCode", entry_at AS "entryAt"`,
      { replacements: { visitorId: visitor.id, identification, name, reason, badgeCode, userId: input.userId }, type: QueryTypes.SELECT, transaction },
    );
    return visit;
  });
}

export async function listActiveVisitorVisits(search = '') {
  return requireDatabase().query<ActiveVisitorVisit>(
    `SELECT vv.id, v.identification, v.name, vv.reason, vv.badge_code AS "badgeCode", vv.entry_at AS "entryAt"
     FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id
     WHERE vv.exit_at IS NULL AND (:search = '' OR v.name ILIKE :pattern OR v.identification ILIKE :pattern OR vv.badge_code ILIKE :pattern)
     ORDER BY vv.entry_at DESC`,
    { replacements: { search: search.trim(), pattern: `%${search.trim()}%` }, type: QueryTypes.SELECT },
  );
}

export async function lookupVisitorByIdentification(identificationInput: string) {
  const identification = requiredText(identificationInput, 'Identificación', 40).toUpperCase();
  const [visitor] = await requireDatabase().query<VisitorIdentity>(
    'SELECT identification, name FROM visitors WHERE identification = :identification',
    { replacements: { identification }, type: QueryTypes.SELECT },
  );
  return visitor ?? null;
}

export async function listAvailableVisitorBadges() {
  const rows = await requireDatabase().query<{ badgeCode: string }>(`SELECT nt.code AS "badgeCode" FROM nfc_tags nt WHERE nt.active = TRUE AND nt.employee_id IS NULL AND NOT EXISTS (SELECT 1 FROM visitor_visits vv WHERE vv.badge_code = nt.code AND (vv.exit_at IS NULL OR vv.badge_return_pending = TRUE)) ORDER BY nt.code`, { type: QueryTypes.SELECT });
  return rows.map((item) => item.badgeCode);
}

export async function registerVisitorExit(visitId: string, userId: string, returnedBadgeCode?: string) {
  const [visit] = await requireDatabase().query<{ badgeCode: string }>('SELECT badge_code AS "badgeCode" FROM visitor_visits WHERE id = :visitId AND exit_at IS NULL', { replacements: { visitId }, type: QueryTypes.SELECT });
  if (!visit) throw new ApiError(409, 'La visita no está activa o ya registró su salida');
  const returned = typeof returnedBadgeCode === 'string' && returnedBadgeCode.trim().length > 0;
  if (returned && visit.badgeCode !== returnedBadgeCode.trim().toUpperCase()) throw new ApiError(409, 'El TAG leído no corresponde al gafete asignado a esta persona');
  const [result] = await requireDatabase().query<ActiveVisitorVisit>(
    `UPDATE visitor_visits vv SET exit_at = NOW(), exit_confirmed_by_user_id = :userId, badge_returned_at = CASE WHEN :returned THEN NOW() ELSE NULL END, badge_return_pending = NOT :returned, updated_at = NOW()
     FROM visitors v WHERE vv.id = :visitId AND vv.visitor_id = v.id AND vv.exit_at IS NULL
     RETURNING vv.id, v.identification, v.name, vv.reason, vv.badge_code AS "badgeCode", vv.entry_at AS "entryAt", vv.badge_return_pending AS "badgeReturnPending"`,
    { replacements: { visitId, userId, returned }, type: QueryTypes.SELECT },
  );
  if (!result) throw new ApiError(409, 'La visita no está activa o ya registró su salida');
  return result;
}

export async function listPendingBadgeReturns() {
  return requireDatabase().query<ActiveVisitorVisit>(`SELECT vv.id, v.identification, v.name, vv.reason, vv.badge_code AS "badgeCode", vv.entry_at AS "entryAt", TRUE AS "badgeReturnPending" FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id WHERE vv.badge_return_pending = TRUE ORDER BY vv.exit_at DESC`, { type: QueryTypes.SELECT });
}

export async function resolvePendingBadgeReturn(visitId: string, badgeCodeInput: string) {
  const badgeCode = requiredText(badgeCodeInput, 'Código de gafete', 80).toUpperCase();
  const [result] = await requireDatabase().query<ActiveVisitorVisit>(`UPDATE visitor_visits vv SET badge_returned_at = NOW(), badge_return_pending = FALSE, updated_at = NOW() FROM visitors v WHERE vv.id = :visitId AND vv.visitor_id = v.id AND vv.badge_return_pending = TRUE AND vv.badge_code = :badgeCode RETURNING vv.id, v.identification, v.name, vv.reason, vv.badge_code AS "badgeCode", vv.entry_at AS "entryAt", FALSE AS "badgeReturnPending"`, { replacements: { visitId, badgeCode }, type: QueryTypes.SELECT });
  if (!result) throw new ApiError(409, 'El TAG leído no corresponde a la devolución pendiente');
  return result;
}
