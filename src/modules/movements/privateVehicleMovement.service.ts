import { QueryTypes, Transaction } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';
import { getEmployeeModel, type Employee } from '../catalogs/employees/employee.model.js';
import { getPrivateVehicleModel } from '../catalogs/private-vehicles/privateVehicle.model.js';
import { getEmployeeMovementModel, type MovementType } from './employeeMovement.model.js';
import { getPrivateVehicleMovementModel } from './privateVehicleMovement.model.js';

export function normalizeMovementPlate(value: string) {
  const plate = value.trim().replace(/[\s-]/g, '').toUpperCase();
  if (plate.length < 3 || plate.length > 15 || !/^[A-Z0-9]+$/.test(plate)) throw new ApiError(400, 'Placa inválida');
  return plate;
}

async function resolveVehicle(plateInput: string, transaction?: Transaction) {
  const plate = normalizeMovementPlate(plateInput);
  const vehicle = await getPrivateVehicleModel().findOne({ where: { plate }, transaction, lock: transaction?.LOCK.UPDATE });
  if (!vehicle) throw new ApiError(404, 'Placa desconocida. Debe continuar con el flujo de visitantes');
  if (!vehicle.active) throw new ApiError(409, 'El vehículo particular está inactivo y requiere autorización excepcional', { code: 'VEHICLE_AUTHORIZATION_REQUIRED', entityType: 'VEHICULO_PARTICULAR', entityId: vehicle.id, requestedMovement: 'INGRESO', authorizedRoute: 'Registre el motivo, la persona que autoriza y las observaciones' });
  const owner = await getEmployeeModel().findByPk(vehicle.ownerEmployeeId, { transaction });
  if (!owner) throw new ApiError(404, 'El vehículo no tiene propietario habitual');
  if (!owner.active) throw new ApiError(409, 'El propietario habitual está inactivo');
  const lastMovement = await getPrivateVehicleMovementModel().findOne({ where: { vehicleId: vehicle.id }, order: [['occurredAt', 'DESC'], ['createdAt', 'DESC']], transaction });
  const proposedMovement: MovementType = lastMovement?.movementType === 'INGRESO' ? 'SALIDA' : 'INGRESO';
  return { vehicle, owner, lastMovement, proposedMovement };
}

type EmployeeData = { id: string; identification: string; name: string; department: string; position: string; active: boolean };

function employeeData(employee: Employee): EmployeeData {
  return { id: employee.id, identification: employee.identification, name: employee.name, department: employee.department, position: employee.position, active: employee.active };
}

export async function resolvePrivateVehicleMovement(plate: string): Promise<{
  vehicle: { id: string; plate: string; brand: string; model: string; color: string };
  habitualDriver: EmployeeData;
  proposedMovement: MovementType;
  lastMovement: { id: string; movementType: MovementType; occurredAt: Date } | null;
}> {
  const { vehicle, owner, lastMovement, proposedMovement } = await resolveVehicle(plate);
  return {
    vehicle: { id: vehicle.id, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model, color: vehicle.color },
    habitualDriver: employeeData(owner),
    proposedMovement,
    lastMovement: lastMovement ? { id: lastMovement.id, movementType: lastMovement.movementType, occurredAt: lastMovement.occurredAt } : null,
  };
}

export async function createPrivateVehicleMovement(input: { plate: string; driverEmployeeId?: string; driverVisitorVisitId?: string; ownerAuthorizationConfirmed?: boolean; authorizationNote?: string; occupantEmployeeIds: string[]; movementType: MovementType; source: 'PLACA_MANUAL' | 'OCR'; manualReason?: string; confirmedByUserId: string }): Promise<{
  id: string; vehicleId: string; driverEmployeeId: string | null; driverVisitorVisitId: string | null; occupantEmployeeIds: string[]; movementType: MovementType; occurredAt: Date;
}> {
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const { vehicle, proposedMovement } = await resolveVehicle(input.plate, transaction);
    if (input.movementType !== proposedMovement) throw new ApiError(409, `El vehículo ya figura ${proposedMovement === 'SALIDA' ? 'dentro' : 'fuera'}; no puede registrar otro ${input.movementType.toLowerCase()} normal`, { code: 'MOVEMENT_INCONSISTENCY', entityType: 'VEHICULO_PARTICULAR', entityId: vehicle.id, requestedMovement: input.movementType, authorizedRoute: 'Un administrador puede registrar una contingencia con motivo obligatorio' });
    const visitorPickup = Boolean(input.driverVisitorVisitId);
    if (Boolean(input.driverEmployeeId) === visitorPickup) throw new ApiError(400, 'Debe seleccionar un conductor funcionario o una visita activa');
    if (visitorPickup && proposedMovement !== 'SALIDA') throw new ApiError(409, 'Una persona visitante solo puede retirar un vehículo que se encuentra dentro');
    if (visitorPickup && !input.ownerAuthorizationConfirmed) throw new ApiError(409, 'Debe confirmar la autorización del propietario para retirar el vehículo');
    if (visitorPickup && (!input.authorizationNote || input.authorizationNote.trim().length < 5)) throw new ApiError(400, 'Registre una observación sobre la autorización del propietario');
    if (visitorPickup) {
      const [visit] = await requireDatabase().query<{ id: string }>('SELECT id FROM visitor_visits WHERE id = :visitId AND exit_at IS NULL', { replacements: { visitId: input.driverVisitorVisitId }, type: QueryTypes.SELECT, transaction });
      if (!visit) throw new ApiError(409, 'La visita seleccionada no está activa');
    }
    const occupantIds = [...new Set(input.occupantEmployeeIds)];
    if (input.driverEmployeeId && occupantIds.includes(input.driverEmployeeId)) throw new ApiError(409, 'El conductor no puede registrarse también como acompañante');
    const personIds = [...(input.driverEmployeeId ? [input.driverEmployeeId] : []), ...occupantIds];
    const people = await getEmployeeModel().findAll({ where: { id: personIds }, transaction, lock: transaction.LOCK.UPDATE });
    if (people.length !== personIds.length) throw new ApiError(404, 'Uno de los funcionarios seleccionados no existe');
    const byId = new Map(people.map((person) => [person.id, person]));
    for (const id of personIds) {
      const person = byId.get(id)!;
      if (!person.active) throw new ApiError(409, `${person.name} está inactivo y no puede generar movimientos`);
      const last = await getEmployeeMovementModel().findOne({ where: { employeeId: id }, order: [['occurredAt', 'DESC'], ['createdAt', 'DESC']], transaction });
      const expected: MovementType = last?.movementType === 'INGRESO' ? 'SALIDA' : 'INGRESO';
      if (expected !== proposedMovement) throw new ApiError(409, `${person.name} no puede registrar ${proposedMovement.toLowerCase()} porque su último estado no coincide`);
    }
    const movement = await getPrivateVehicleMovementModel().create({ vehicleId: vehicle.id, driverEmployeeId: input.driverEmployeeId ?? null, driverVisitorVisitId: input.driverVisitorVisitId ?? null, ownerAuthorizationConfirmed: input.ownerAuthorizationConfirmed ?? false, authorizationNote: input.authorizationNote?.trim() ?? null, movementType: proposedMovement, source: input.source, confirmedByUserId: input.confirmedByUserId }, { transaction });
    if (input.source === 'PLACA_MANUAL') {
      const reason = input.manualReason?.trim(); if (!reason || reason.length < 10 || reason.length > 500) throw new ApiError(400, 'El motivo de uso manual debe tener entre 10 y 500 caracteres');
      await requireDatabase().query(`INSERT INTO manual_movement_reviews(private_vehicle_movement_id,record_type,reason) VALUES(:movementId,'VEHICULO_PARTICULAR',:reason)`, { replacements: { movementId: movement.id, reason }, type: QueryTypes.INSERT, transaction });
    }
    if (personIds.length) await getEmployeeMovementModel().bulkCreate(personIds.map((employeeId) => ({ employeeId, nfcTagId: null, movementType: proposedMovement, source: 'VEHICULO_PARTICULAR' as const, confirmedByUserId: input.confirmedByUserId })), { transaction });
    if (visitorPickup) await requireDatabase().query('UPDATE visitor_visits SET exit_at = NOW(), exit_confirmed_by_user_id = :userId, updated_at = NOW() WHERE id = :visitId AND exit_at IS NULL', { replacements: { visitId: input.driverVisitorVisitId, userId: input.confirmedByUserId }, type: QueryTypes.UPDATE, transaction });
    for (const employeeId of occupantIds) {
      await requireDatabase().query('INSERT INTO private_vehicle_movement_occupants (movement_id, employee_id) VALUES (:movementId, :employeeId)', { replacements: { movementId: movement.id, employeeId }, type: QueryTypes.INSERT, transaction });
    }
    return { id: movement.id, vehicleId: vehicle.id, driverEmployeeId: input.driverEmployeeId ?? null, driverVisitorVisitId: input.driverVisitorVisitId ?? null, occupantEmployeeIds: occupantIds, movementType: movement.movementType, occurredAt: movement.occurredAt };
  });
}
