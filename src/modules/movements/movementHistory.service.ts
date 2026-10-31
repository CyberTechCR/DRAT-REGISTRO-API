import { QueryTypes } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';

export const historyTypes = ['FUNCIONARIO', 'VEHICULO_PARTICULAR', 'VEHICULO_INSTITUCIONAL', 'VISITANTE', 'PROVEEDOR'] as const;
export const historyStates = ['INGRESO', 'SALIDA'] as const;
export type HistoryType = typeof historyTypes[number];
export type HistoryState = typeof historyStates[number];

export type MovementHistoryRecord = {
  id: string; type: HistoryType; state: HistoryState; subject: string; identifier: string;
  occurredAt: Date; source: string; operatorName: string; operatorEmail: string;
  details: Record<string, unknown>;
};

export function validateHistoryFilters(query: Record<string, unknown>) {
  const type = typeof query.type === 'string' && query.type ? query.type : undefined;
  const state = typeof query.state === 'string' && query.state ? query.state : undefined;
  if (type && !historyTypes.includes(type as HistoryType)) throw new ApiError(400, 'Tipo de movimiento inválido');
  if (state && !historyStates.includes(state as HistoryState)) throw new ApiError(400, 'Estado de movimiento inválido');
  const from = typeof query.from === 'string' && query.from ? new Date(`${query.from}T00:00:00-06:00`) : undefined;
  const to = typeof query.to === 'string' && query.to ? new Date(`${query.to}T23:59:59.999-06:00`) : undefined;
  if (from && Number.isNaN(from.getTime())) throw new ApiError(400, 'Fecha inicial inválida');
  if (to && Number.isNaN(to.getTime())) throw new ApiError(400, 'Fecha final inválida');
  if (from && to && from > to) throw new ApiError(400, 'La fecha inicial no puede ser posterior a la fecha final');
  return { type: type as HistoryType | undefined, state: state as HistoryState | undefined, from, to };
}

export async function listMovementHistory(filters: ReturnType<typeof validateHistoryFilters>) {
  const conditions: string[] = [];
  const replacements: Record<string, string | Date> = {};
  if (filters.type) { conditions.push('history.type = :type'); replacements.type = filters.type; }
  if (filters.state) { conditions.push('history.state = :state'); replacements.state = filters.state; }
  if (filters.from) { conditions.push('history."occurredAt" >= :from'); replacements.from = filters.from; }
  if (filters.to) { conditions.push('history."occurredAt" <= :to'); replacements.to = filters.to; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return requireDatabase().query<MovementHistoryRecord>(`
    SELECT * FROM (
      SELECT em.id::text AS id, 'FUNCIONARIO'::text AS type, em.movement_type::text AS state,
             e.name AS subject, e.identification AS identifier, em.occurred_at AS "occurredAt",
             em.source AS source, u.name AS "operatorName", u.email AS "operatorEmail",
             jsonb_build_object('departamento', e.department, 'puesto', e.position, 'tag', nt.code) AS details
      FROM employee_movements em JOIN employees e ON e.id = em.employee_id
      JOIN users u ON u.id = em.confirmed_by_user_id LEFT JOIN nfc_tags nt ON nt.id = em.nfc_tag_id
      UNION ALL
      SELECT pvm.id::text, 'VEHICULO_PARTICULAR', pvm.movement_type::text,
             CONCAT(pv.brand, ' ', pv.model), pv.plate, pvm.occurred_at, pvm.source,
             u.name, u.email,
             jsonb_build_object('color', pv.color, 'conductorFuncionario', de.name, 'conductorVisitante', vi.name,
               'autorizacionPropietario', pvm.owner_authorization_confirmed, 'observacion', pvm.authorization_note,
               'motivoExcepcion', mc.reason, 'autorizadoPor', mc.authorized_by_reference, 'observacionesExcepcion', mc.observations)
      FROM private_vehicle_movements pvm JOIN private_vehicles pv ON pv.id = pvm.vehicle_id
      JOIN users u ON u.id = pvm.confirmed_by_user_id LEFT JOIN employees de ON de.id = pvm.driver_employee_id
      LEFT JOIN visitor_visits vv ON vv.id = pvm.driver_visitor_visit_id LEFT JOIN visitors vi ON vi.id = vv.visitor_id
      LEFT JOIN movement_contingencies mc ON mc.created_movement_id=pvm.id AND mc.entity_type='VEHICULO_PARTICULAR'
      UNION ALL
      SELECT CONCAT(ivt.id, '-SALIDA'), 'VEHICULO_INSTITUCIONAL', 'SALIDA',
             CONCAT(iv.brand, ' ', iv.model), iv.plate, ivt.departure_at, 'BOLETA_SOIN',
             u.name, u.email,
             jsonb_build_object('boletaSoin', ivt.soin_number, 'destino', ivt.destination, 'conductor', e.name,
               'kilometraje', ivt.departure_mileage, 'combustible', ivt.departure_fuel)
      FROM institutional_vehicle_trips ivt JOIN institutional_vehicles iv ON iv.id = ivt.vehicle_id
      JOIN employees e ON e.id = ivt.driver_employee_id JOIN users u ON u.id = ivt.departure_confirmed_by_user_id
      UNION ALL
      SELECT CONCAT(ivt.id, '-INGRESO'), 'VEHICULO_INSTITUCIONAL', 'INGRESO',
             CONCAT(iv.brand, ' ', iv.model), iv.plate, ivt.return_at, 'BOLETA_SOIN',
             u.name, u.email,
             jsonb_build_object('boletaSoin', ivt.soin_number, 'destino', ivt.destination, 'kilometraje', ivt.return_mileage,
               'combustible', ivt.return_fuel)
      FROM institutional_vehicle_trips ivt JOIN institutional_vehicles iv ON iv.id = ivt.vehicle_id
      JOIN users u ON u.id = ivt.return_confirmed_by_user_id WHERE ivt.return_at IS NOT NULL
      UNION ALL
      SELECT CONCAT(vv.id, '-INGRESO'), 'VISITANTE', 'INGRESO', v.name, v.identification,
             vv.entry_at, 'REGISTRO_VISITANTE', u.name, u.email,
             jsonb_build_object('gafete', vv.badge_code, 'motivo', vv.reason, 'contingenciaSinGafete', vv.badge_contingency, 'observacionContingencia', vv.contingency_observation, 'revisionAdministrativa', vv.administrative_review_status)
      FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id JOIN users u ON u.id = vv.entry_confirmed_by_user_id
      UNION ALL
      SELECT CONCAT(vv.id, '-SALIDA'), 'VISITANTE', 'SALIDA', v.name, v.identification,
             vv.exit_at, 'REGISTRO_VISITANTE', u.name, u.email,
             jsonb_build_object('gafete', vv.badge_code, 'motivo', vv.reason, 'contingenciaSinGafete', vv.badge_contingency, 'observacionContingencia', vv.contingency_observation, 'revisionAdministrativa', vv.administrative_review_status)
      FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id JOIN users u ON u.id = vv.exit_confirmed_by_user_id
      WHERE vv.exit_at IS NOT NULL
      UNION ALL
      SELECT ppm.id::text, 'PROVEEDOR', ppm.movement_type::text, pp.name, pp.identification,
             ppm.occurred_at, ppm.source, u.name, u.email,
             jsonb_build_object('empresa',pp.company,'telefono',pp.phone,'placa',ppv.plate,'tag',nt.code)
      FROM permanent_provider_movements ppm JOIN permanent_providers pp ON pp.id=ppm.provider_id
      JOIN users u ON u.id=ppm.confirmed_by_user_id LEFT JOIN permanent_provider_vehicles ppv ON ppv.id=ppm.vehicle_id
      LEFT JOIN nfc_tags nt ON nt.id=ppm.nfc_tag_id
    ) history ${where}
    ORDER BY history."occurredAt" DESC
    LIMIT 1000
  `, { replacements, type: QueryTypes.SELECT });
}
