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
};

export type VisitorIdentity = { identification: string; name: string };

const visitorBadgeCodes = Array.from({ length: 30 }, (_, index) => `VIS-${String(index + 1).padStart(3, '0')}`);

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
  if (!visitorBadgeCodes.includes(badgeCode)) throw new ApiError(400, 'Seleccione un gafete del catálogo autorizado');
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
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
  const active = await requireDatabase().query<{ badgeCode: string }>(
    'SELECT badge_code AS "badgeCode" FROM visitor_visits WHERE exit_at IS NULL',
    { type: QueryTypes.SELECT },
  );
  const occupied = new Set(active.map((item) => item.badgeCode.toUpperCase()));
  return visitorBadgeCodes.filter((code) => !occupied.has(code));
}

export async function registerVisitorExit(visitId: string, userId: string) {
  const [result] = await requireDatabase().query<ActiveVisitorVisit>(
    `UPDATE visitor_visits vv SET exit_at = NOW(), exit_confirmed_by_user_id = :userId, updated_at = NOW()
     FROM visitors v WHERE vv.id = :visitId AND vv.visitor_id = v.id AND vv.exit_at IS NULL
     RETURNING vv.id, v.identification, v.name, vv.reason, vv.badge_code AS "badgeCode", vv.entry_at AS "entryAt"`,
    { replacements: { visitId, userId }, type: QueryTypes.SELECT },
  );
  if (!result) throw new ApiError(409, 'La visita no está activa o ya registró su salida');
  return result;
}
