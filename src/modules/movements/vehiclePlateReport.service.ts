import { QueryTypes } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';

export type VehiclePlateReportRecord = {
  id: string;
  vehicleType: 'PARTICULAR' | 'INSTITUCIONAL' | 'VISITANTE' | 'PROVEEDOR';
  plate: string;
  movementType: 'INGRESO' | 'SALIDA';
  occurredAt: Date;
  source: string;
  subject: string;
  operatorName: string;
  operatorEmail: string;
  details: Record<string, unknown>;
};

function date(value: unknown, label: string, endOfDay = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, `${label} inválida`);
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}-06:00`);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, `${label} inválida`);
  return parsed;
}

export function validateVehiclePlateReportFilters(query: Record<string, unknown>) {
  if (typeof query.plate !== 'string') throw new ApiError(400, 'Placa requerida');
  const plate = query.plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate.length < 3 || plate.length > 20) throw new ApiError(400, 'Placa inválida');
  const from = date(query.from, 'Fecha inicial');
  const to = date(query.to, 'Fecha final', true);
  if (from > to) throw new ApiError(400, 'La fecha inicial no puede ser posterior a la fecha final');
  return { plate, from, to };
}

export async function generateVehiclePlateReport(filters: ReturnType<typeof validateVehiclePlateReportFilters>) {
  return requireDatabase().query<VehiclePlateReportRecord>(`
    SELECT * FROM (
      SELECT pvm.id::text AS id, 'PARTICULAR'::text AS "vehicleType", pv.plate,
             pvm.movement_type::text AS "movementType", pvm.occurred_at AS "occurredAt", pvm.source,
             CONCAT(pv.brand, ' ', pv.model) AS subject, u.name AS "operatorName", u.email AS "operatorEmail",
             jsonb_build_object('color', pv.color, 'conductor', COALESCE(e.name, v.name),
               'identificacionConductor', COALESCE(e.identification, v.identification),
               'autorizacionPropietario', pvm.owner_authorization_confirmed, 'observacion', pvm.authorization_note) AS details
      FROM private_vehicle_movements pvm JOIN private_vehicles pv ON pv.id=pvm.vehicle_id
      JOIN users u ON u.id=pvm.confirmed_by_user_id LEFT JOIN employees e ON e.id=pvm.driver_employee_id
      LEFT JOIN visitor_visits vv ON vv.id=pvm.driver_visitor_visit_id LEFT JOIN visitors v ON v.id=vv.visitor_id
      UNION ALL
      SELECT CONCAT(ivt.id, '-SALIDA'), 'INSTITUCIONAL', iv.plate, 'SALIDA', ivt.departure_at, 'BOLETA_SOIN',
             CONCAT(iv.brand, ' ', iv.model), u.name, u.email,
             jsonb_build_object('boletaSoin', ivt.soin_number, 'destino', ivt.destination, 'conductor', e.name,
               'kilometraje', ivt.departure_mileage, 'combustible', ivt.departure_fuel) AS details
      FROM institutional_vehicle_trips ivt JOIN institutional_vehicles iv ON iv.id=ivt.vehicle_id
      JOIN employees e ON e.id=ivt.driver_employee_id JOIN users u ON u.id=ivt.departure_confirmed_by_user_id
      UNION ALL
      SELECT CONCAT(ivt.id, '-INGRESO'), 'INSTITUCIONAL', iv.plate, 'INGRESO', ivt.return_at, 'BOLETA_SOIN',
             CONCAT(iv.brand, ' ', iv.model), u.name, u.email,
             jsonb_build_object('boletaSoin', ivt.soin_number, 'destino', ivt.destination,
               'kilometraje', ivt.return_mileage, 'combustible', ivt.return_fuel) AS details
      FROM institutional_vehicle_trips ivt JOIN institutional_vehicles iv ON iv.id=ivt.vehicle_id
      JOIN users u ON u.id=ivt.return_confirmed_by_user_id WHERE ivt.return_at IS NOT NULL
      UNION ALL
      SELECT CONCAT(vvv.id, '-INGRESO'), 'VISITANTE', vvv.plate, 'INGRESO', vvv.entry_at, 'REGISTRO_VISITANTE',
             'Vehículo visitante', u.name, u.email,
             jsonb_build_object('ocupantes', COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', v.name,
               'identificacion', v.identification, 'rol', vvvo.role, 'motivo', vv.reason) ORDER BY vvvo.role DESC, v.name)
               FROM visitor_vehicle_visit_occupants vvvo JOIN visitor_visits vv ON vv.id=vvvo.visitor_visit_id
               JOIN visitors v ON v.id=vv.visitor_id WHERE vvvo.vehicle_visit_id=vvv.id), '[]'::jsonb)) AS details
      FROM visitor_vehicle_visits vvv JOIN users u ON u.id=vvv.entry_confirmed_by_user_id
      UNION ALL
      SELECT CONCAT(vvv.id, '-SALIDA'), 'VISITANTE', vvv.plate, 'SALIDA', vvv.exit_at, 'REGISTRO_VISITANTE',
             'Vehículo visitante', u.name, u.email, jsonb_build_object() AS details
      FROM visitor_vehicle_visits vvv JOIN users u ON u.id=vvv.exit_confirmed_by_user_id WHERE vvv.exit_at IS NOT NULL
      UNION ALL
      SELECT ppm.id::text, 'PROVEEDOR', ppv.plate, ppm.movement_type::text, ppm.occurred_at, ppm.source,
             CONCAT(pp.name, ' · ', pp.company), u.name, u.email,
             jsonb_build_object('proveedor', pp.name, 'identificacion', pp.identification, 'empresa', pp.company,
               'telefono', pp.phone) AS details
      FROM permanent_provider_movements ppm JOIN permanent_provider_vehicles ppv ON ppv.id=ppm.vehicle_id
      JOIN permanent_providers pp ON pp.id=ppm.provider_id JOIN users u ON u.id=ppm.confirmed_by_user_id
    ) report
    WHERE report.plate=:plate AND report."occurredAt" BETWEEN :from AND :to
    ORDER BY report."occurredAt" DESC
    LIMIT 5000
  `, { replacements: filters, type: QueryTypes.SELECT });
}
