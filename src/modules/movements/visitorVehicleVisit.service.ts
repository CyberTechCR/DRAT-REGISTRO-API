import { QueryTypes, Transaction } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';

type VisitorOccupantInput = { identification: string; name: string; reason: string; badgeCode: string; role: 'CONDUCTOR' | 'OCUPANTE' };

function text(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > maximum) throw new ApiError(400, `${field} inválido`);
  return value.trim();
}

export async function registerVisitorVehicleEntry(input: { plate: string; occupants: VisitorOccupantInput[]; userId: string }) {
  const plate = text(input.plate, 'Placa', 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate.length < 3) throw new ApiError(400, 'Placa inválida');
  if (!Array.isArray(input.occupants) || input.occupants.length === 0 || input.occupants.length > 15) throw new ApiError(400, 'Debe registrar entre 1 y 15 ocupantes');
  if (input.occupants.filter((item) => item.role === 'CONDUCTOR').length !== 1) throw new ApiError(400, 'Debe existir exactamente un conductor');
  const occupants = input.occupants.map((item) => { if (!['CONDUCTOR', 'OCUPANTE'].includes(item.role)) throw new ApiError(400, 'Rol de ocupante inválido'); return { identification: text(item.identification, 'Identificación', 40).toUpperCase(), name: text(item.name, 'Nombre', 160), reason: text(item.reason, 'Motivo de visita', 300), badgeCode: text(item.badgeCode, 'Código de gafete', 40).toUpperCase(), role: item.role }; });
  if (new Set(occupants.map((item) => item.identification)).size !== occupants.length) throw new ApiError(400, 'No puede registrar dos veces a la misma persona');
  if (new Set(occupants.map((item) => item.badgeCode)).size !== occupants.length) throw new ApiError(400, 'Cada ocupante debe recibir un gafete diferente');

  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const [openVehicle] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_vehicle_visits WHERE plate = :plate AND exit_at IS NULL', { replacements: { plate }, type: QueryTypes.SELECT, transaction });
    if (openVehicle) throw new ApiError(409, 'El vehículo visitante ya figura dentro del plantel');
    const visitIds: { id: string; role: 'CONDUCTOR' | 'OCUPANTE' }[] = [];
    for (const occupant of occupants) {
      const [validBadge] = await requireDatabase().query<{ id: string }>('SELECT id FROM nfc_tags WHERE code = :badgeCode AND active = TRUE AND employee_id IS NULL', { replacements: { badgeCode: occupant.badgeCode }, type: QueryTypes.SELECT, transaction });
      if (!validBadge) throw new ApiError(409, `El TAG de ${occupant.name} no está activo o disponible`);
      const [occupiedBadge] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_visits WHERE badge_code = :badgeCode AND exit_at IS NULL', { replacements: { badgeCode: occupant.badgeCode }, type: QueryTypes.SELECT, transaction });
      if (occupiedBadge) throw new ApiError(409, `El gafete ${occupant.badgeCode} ya está asignado`);
      const [visitor] = await requireDatabase().query<{ id: string }>(`INSERT INTO visitors (identification, name) VALUES (:identification, :name) ON CONFLICT (identification) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW() RETURNING id`, { replacements: occupant, type: QueryTypes.SELECT, transaction });
      if (!visitor) throw new ApiError(500, 'No fue posible registrar un ocupante');
      const [openVisit] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_visits WHERE visitor_id = :visitorId AND exit_at IS NULL', { replacements: { visitorId: visitor.id }, type: QueryTypes.SELECT, transaction });
      if (openVisit) throw new ApiError(409, `${occupant.name} ya figura dentro del plantel`);
      const [visit] = await requireDatabase().query<{ id: string }>(`INSERT INTO visitor_visits (visitor_id, reason, badge_code, entry_confirmed_by_user_id) VALUES (:visitorId, :reason, :badgeCode, :userId) RETURNING id`, { replacements: { visitorId: visitor.id, reason: occupant.reason, badgeCode: occupant.badgeCode, userId: input.userId }, type: QueryTypes.SELECT, transaction });
      if (!visit) throw new ApiError(500, 'No fue posible registrar un ocupante');
      visitIds.push({ id: visit.id, role: occupant.role });
    }
    const [vehicleVisit] = await requireDatabase().query<{ id: string; plate: string; entryAt: Date }>(`INSERT INTO visitor_vehicle_visits (plate, entry_confirmed_by_user_id) VALUES (:plate, :userId) RETURNING id, plate, entry_at AS "entryAt"`, { replacements: { plate, userId: input.userId }, type: QueryTypes.SELECT, transaction });
    if (!vehicleVisit) throw new ApiError(500, 'No fue posible registrar el vehículo visitante');
    for (const occupant of visitIds) await requireDatabase().query(`INSERT INTO visitor_vehicle_visit_occupants (vehicle_visit_id, visitor_visit_id, role) VALUES (:vehicleVisitId, :visitorVisitId, :role)`, { replacements: { vehicleVisitId: vehicleVisit.id, visitorVisitId: occupant.id, role: occupant.role }, type: QueryTypes.INSERT, transaction });
    return { ...vehicleVisit, occupants: occupants.map(({ identification, name, badgeCode, role }) => ({ identification, name, badgeCode, role })) };
  });
}
