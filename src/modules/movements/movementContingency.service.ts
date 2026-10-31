import { QueryTypes, Transaction } from 'sequelize';
import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';
import { getEmployeeModel } from '../catalogs/employees/employee.model.js';
import { getPrivateVehicleModel } from '../catalogs/private-vehicles/privateVehicle.model.js';
import { getEmployeeMovementModel, type MovementType } from './employeeMovement.model.js';
import { getPrivateVehicleMovementModel } from './privateVehicleMovement.model.js';

export type ContingencyEntity = 'FUNCIONARIO' | 'VEHICULO_PARTICULAR';
export function validateContingencyReason(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 500) throw new ApiError(400, 'El motivo de contingencia debe tener entre 10 y 500 caracteres');
  return value.trim();
}
function evidence(value:unknown,field:string,max:number){if(typeof value!=='string'||value.trim().length<2||value.trim().length>max)throw new ApiError(400,`${field} debe tener entre 2 y ${max} caracteres`);return value.trim();}

export async function createMovementContingency(input: { entityType: ContingencyEntity; entityId: string; movementType: MovementType; reason: string; authorizedByReference?:string; observations?:string; authorizedByUserId: string }) {
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const reason = validateContingencyReason(input.reason); let previousMovement: MovementType | null; let createdMovementId: string;
    if (input.entityType === 'FUNCIONARIO') {
      const employee = await getEmployeeModel().findByPk(input.entityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!employee || !employee.active) throw new ApiError(404, 'Funcionario activo no encontrado');
      const previous = await getEmployeeMovementModel().findOne({ where: { employeeId: employee.id }, order: [['occurredAt', 'DESC'], ['createdAt', 'DESC']], transaction }); previousMovement = previous?.movementType ?? null;
      if (previousMovement !== input.movementType) throw new ApiError(409, 'No existe una inconsistencia: el movimiento solicitado ya es el siguiente movimiento normal');
      const created = await getEmployeeMovementModel().create({ employeeId: employee.id, nfcTagId: null, movementType: input.movementType, source: 'CONTINGENCIA', confirmedByUserId: input.authorizedByUserId }, { transaction }); createdMovementId = created.id;
    } else {
      const vehicle = await getPrivateVehicleModel().findByPk(input.entityId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!vehicle) throw new ApiError(404, 'Vehículo particular no encontrado');
      const driver = await getEmployeeModel().findByPk(vehicle.ownerEmployeeId, { transaction }); if (!driver || !driver.active) throw new ApiError(409, 'El propietario habitual no está activo');
      const previous = await getPrivateVehicleMovementModel().findOne({ where: { vehicleId: vehicle.id }, order: [['occurredAt', 'DESC'], ['createdAt', 'DESC']], transaction }); previousMovement = previous?.movementType ?? null;
      if (vehicle.active && previousMovement !== input.movementType) throw new ApiError(409, 'No existe una inconsistencia: el movimiento solicitado ya es el siguiente movimiento normal');
      const created = await getPrivateVehicleMovementModel().create({ vehicleId: vehicle.id, driverEmployeeId: driver.id, driverVisitorVisitId: null, ownerAuthorizationConfirmed: false, authorizationNote: null, movementType: input.movementType, source: 'CONTINGENCIA', confirmedByUserId: input.authorizedByUserId }, { transaction }); createdMovementId = created.id;
      await getEmployeeMovementModel().create({ employeeId: driver.id, nfcTagId: null, movementType: input.movementType, source: 'CONTINGENCIA', confirmedByUserId: input.authorizedByUserId }, { transaction });
    }
    const authorizedByReference=input.entityType==='VEHICULO_PARTICULAR'?evidence(input.authorizedByReference,'La referencia de autorización',160):input.authorizedByReference?.trim()??null;
    const observations=input.entityType==='VEHICULO_PARTICULAR'?evidence(input.observations,'Las observaciones',500):input.observations?.trim()??null;
    await requireDatabase().query(`INSERT INTO movement_contingencies (entity_type, entity_id, requested_movement, previous_movement, reason, authorized_by_reference, observations, authorized_by_user_id, created_movement_id) VALUES (:entityType, :entityId, :movementType, :previousMovement, :reason, :authorizedByReference, :observations, :userId, :movementId)`, { replacements: { entityType: input.entityType, entityId: input.entityId, movementType: input.movementType, previousMovement, reason, authorizedByReference, observations, userId: input.authorizedByUserId, movementId: createdMovementId }, type: QueryTypes.INSERT, transaction });
    return { entityType: input.entityType, entityId: input.entityId, movementType: input.movementType, previousMovement, reason, authorizedByReference, observations, createdMovementId };
  });
}
