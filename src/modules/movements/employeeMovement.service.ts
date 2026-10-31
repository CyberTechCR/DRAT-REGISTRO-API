import { QueryTypes, Transaction } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';
import { getEmployeeModel } from '../catalogs/employees/employee.model.js';
import { getNfcTagModel } from '../catalogs/nfc-tags/nfcTag.model.js';
import { normalizeNfcCode } from '../catalogs/nfc-tags/nfcTag.validation.js';
import { getEmployeeMovementModel, type MovementSource, type MovementType } from './employeeMovement.model.js';

type ResolutionResult = {
  tag: { id: string; code: string };
  employee: { id: string; identification: string; name: string; department: string; position: string; active: boolean };
  proposedMovement: MovementType;
  lastMovement: { id: string; movementType: MovementType; occurredAt: Date } | null;
};

type CreatedMovementResult = {
  id: string;
  employeeId: string;
  nfcTagId: string | null;
  movementType: MovementType;
  source: MovementSource;
  confirmedByUserId: string;
  occurredAt: Date;
  employee: { id: string; identification: string; name: string };
};

async function resolve(code: string, transaction?: Transaction) {
  const tag = await getNfcTagModel().findOne({ where: { code: normalizeNfcCode(code) }, transaction, lock: transaction?.LOCK.UPDATE });
  if (!tag) throw new ApiError(404, 'TAG NFC desconocido');
  if (!tag.active) throw new ApiError(409, 'El TAG NFC está inactivo');
  if (!tag.employeeId) throw new ApiError(409, 'El TAG no tiene un funcionario asociado');
  const employee = await getEmployeeModel().findByPk(tag.employeeId, { transaction });
  if (!employee) throw new ApiError(404, 'El TAG no tiene un funcionario asociado');
  if (!employee.active) throw new ApiError(409, 'El funcionario asociado está inactivo');
  const lastMovement = await getEmployeeMovementModel().findOne({ where: { employeeId: employee.id }, order: [['occurredAt', 'DESC']], transaction });
  const proposedMovement: MovementType = lastMovement?.movementType === 'INGRESO' ? 'SALIDA' : 'INGRESO';
  return { tag, employee, lastMovement, proposedMovement };
}

async function resolveEmployee(employeeId: string, transaction?: Transaction) {
  const employee = await getEmployeeModel().findByPk(employeeId, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!employee) throw new ApiError(404, 'Funcionario no encontrado');
  if (!employee.active) throw new ApiError(409, 'El funcionario está inactivo y no puede generar movimientos');
  const lastMovement = await getEmployeeMovementModel().findOne({ where: { employeeId }, order: [['occurredAt', 'DESC']], transaction });
  const proposedMovement: MovementType = lastMovement?.movementType === 'INGRESO' ? 'SALIDA' : 'INGRESO';
  return { employee, lastMovement, proposedMovement };
}

export async function resolveNfcMovement(code: string): Promise<ResolutionResult> {
  const { tag, employee, lastMovement, proposedMovement } = await resolve(code);
  return {
    tag: { id: tag.id, code: tag.code },
    employee: { id: employee.id, identification: employee.identification, name: employee.name, department: employee.department, position: employee.position, active: employee.active },
    proposedMovement,
    lastMovement: lastMovement ? { id: lastMovement.id, movementType: lastMovement.movementType, occurredAt: lastMovement.occurredAt } : null,
  };
}

export async function createNfcMovement(input: { code: string; movementType: MovementType; source: MovementSource; confirmedByUserId: string }): Promise<CreatedMovementResult> {
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const { tag, employee, proposedMovement } = await resolve(input.code, transaction);
    if (input.movementType !== proposedMovement) throw new ApiError(409, `El funcionario ya figura ${proposedMovement === 'SALIDA' ? 'dentro' : 'fuera'}; no puede registrar otro ${input.movementType.toLowerCase()} normal`, { code: 'MOVEMENT_INCONSISTENCY', entityType: 'FUNCIONARIO', entityId: employee.id, requestedMovement: input.movementType, authorizedRoute: 'Un administrador puede registrar una contingencia con motivo obligatorio' });
    const movement = await getEmployeeMovementModel().create({ employeeId: employee.id, nfcTagId: tag.id, movementType: proposedMovement, source: input.source, confirmedByUserId: input.confirmedByUserId }, { transaction });
    return {
      id: movement.id,
      employeeId: movement.employeeId,
      nfcTagId: movement.nfcTagId,
      movementType: movement.movementType,
      source: movement.source,
      confirmedByUserId: movement.confirmedByUserId,
      occurredAt: movement.occurredAt,
      employee: { id: employee.id, identification: employee.identification, name: employee.name },
    };
  });
}

export async function resolveManualMovement(employeeId: string): Promise<Omit<ResolutionResult, 'tag'>> {
  const { employee, lastMovement, proposedMovement } = await resolveEmployee(employeeId);
  return {
    employee: { id: employee.id, identification: employee.identification, name: employee.name, department: employee.department, position: employee.position, active: employee.active },
    proposedMovement,
    lastMovement: lastMovement ? { id: lastMovement.id, movementType: lastMovement.movementType, occurredAt: lastMovement.occurredAt } : null,
  };
}

export async function createManualMovement(input: { employeeId: string; movementType: MovementType; reason: string; confirmedByUserId: string }): Promise<CreatedMovementResult> {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 10 || reason.length > 500) throw new ApiError(400, 'El motivo de uso manual debe tener entre 10 y 500 caracteres');
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const { employee, proposedMovement } = await resolveEmployee(input.employeeId, transaction);
    if (input.movementType !== proposedMovement) throw new ApiError(409, `El funcionario ya figura ${proposedMovement === 'SALIDA' ? 'dentro' : 'fuera'}; no puede registrar otro ${input.movementType.toLowerCase()} normal`, { code: 'MOVEMENT_INCONSISTENCY', entityType: 'FUNCIONARIO', entityId: employee.id, requestedMovement: input.movementType, authorizedRoute: 'Un administrador puede registrar una contingencia con motivo obligatorio' });
    const movement = await getEmployeeMovementModel().create({ employeeId: employee.id, nfcTagId: null, movementType: proposedMovement, source: 'BUSQUEDA_MANUAL', confirmedByUserId: input.confirmedByUserId }, { transaction });
    await requireDatabase().query('INSERT INTO manual_movement_reviews(employee_movement_id,reason) VALUES(:movementId,:reason)', { replacements: { movementId: movement.id, reason }, type: QueryTypes.INSERT, transaction });
    return { id: movement.id, employeeId: movement.employeeId, nfcTagId: null, movementType: movement.movementType, source: movement.source, confirmedByUserId: movement.confirmedByUserId, occurredAt: movement.occurredAt, employee: { id: employee.id, identification: employee.identification, name: employee.name } };
  });
}

export async function listPendingManualMovementReviews() {
  return requireDatabase().query(`SELECT mmr.id,COALESCE(em.id,pvm.id) AS "movementId",CASE WHEN mmr.record_type='FUNCIONARIO' THEN e.name ELSE CONCAT(pv.brand,' ',pv.model) END AS name,CASE WHEN mmr.record_type='FUNCIONARIO' THEN e.identification ELSE pv.plate END AS identification,COALESCE(em.movement_type,pvm.movement_type) AS "movementType",COALESCE(em.occurred_at,pvm.occurred_at) AS "occurredAt",mmr.reason,u.name AS "operatorName",mmr.record_type AS "recordType" FROM manual_movement_reviews mmr LEFT JOIN employee_movements em ON em.id=mmr.employee_movement_id LEFT JOIN employees e ON e.id=em.employee_id LEFT JOIN private_vehicle_movements pvm ON pvm.id=mmr.private_vehicle_movement_id LEFT JOIN private_vehicles pv ON pv.id=pvm.vehicle_id JOIN users u ON u.id=COALESCE(em.confirmed_by_user_id,pvm.confirmed_by_user_id) WHERE mmr.status='PENDIENTE' ORDER BY mmr.created_at DESC`, { type: QueryTypes.SELECT });
}

export async function resolveManualMovementReview(id: string, noteInput: unknown, userId: string) {
  return decideManualMovementReview(id, 'APROBADO', noteInput, userId);
}

export async function decideManualMovementReview(id: string, decisionInput: unknown, noteInput: unknown, userId: string) {
  if (decisionInput !== 'APROBADO' && decisionInput !== 'RECHAZADO') throw new ApiError(400, 'Decisión inválida');
  if (typeof noteInput !== 'string' || noteInput.trim().length < 2 || noteInput.trim().length > 500) throw new ApiError(400, 'Nota de revisión requerida');
  const [result] = await requireDatabase().query(`UPDATE manual_movement_reviews SET status=:decision,decision=:decision,review_note=:note,reviewed_by_user_id=:userId,reviewed_at=NOW() WHERE id=:id AND status='PENDIENTE' RETURNING id,status AS decision,reviewed_at AS "reviewedAt"`, { replacements: { id, decision: decisionInput, note: noteInput.trim(), userId }, type: QueryTypes.SELECT });
  if (!result) throw new ApiError(409, 'La revisión ya fue resuelta o no existe');
  return result;
}

export async function getCurrentPresenceCount(): Promise<number> {
  return (await getEmergencyPresence()).length;
}

export type EmergencyPresenceRecord = {
  id: string;
  kind: 'FUNCIONARIO' | 'VISITANTE' | 'PROVEEDOR';
  name: string;
  identification: string;
  detail: string;
  enteredAt: Date;
};

export async function getEmergencyPresence(): Promise<EmergencyPresenceRecord[]> {
  return requireDatabase().query<EmergencyPresenceRecord>(`
    WITH latest_employee AS (
      SELECT DISTINCT ON (employee_id) employee_id, movement_type, occurred_at
      FROM employee_movements
      ORDER BY employee_id, occurred_at DESC, created_at DESC
    )
    SELECT e.id::text AS id, 'FUNCIONARIO' AS kind, e.name, e.identification,
           CONCAT(e.department, ' · ', e.position) AS detail, le.occurred_at AS "enteredAt"
    FROM latest_employee le JOIN employees e ON e.id = le.employee_id
    WHERE le.movement_type = 'INGRESO'
    UNION ALL
    SELECT vv.id::text AS id, 'VISITANTE' AS kind, v.name, v.identification,
           CONCAT('Gafete ', vv.badge_code, ' · ', vv.reason) AS detail, vv.entry_at AS "enteredAt"
    FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id
    WHERE vv.exit_at IS NULL
    UNION ALL
    SELECT pp.id::text AS id, 'PROVEEDOR' AS kind, pp.name, pp.identification,
           CONCAT(pp.company, ' · Proveedor permanente') AS detail, latest.occurred_at AS "enteredAt"
    FROM (SELECT DISTINCT ON (provider_id) provider_id,movement_type,occurred_at FROM permanent_provider_movements ORDER BY provider_id,occurred_at DESC,created_at DESC) latest
    JOIN permanent_providers pp ON pp.id=latest.provider_id WHERE latest.movement_type='INGRESO'
    ORDER BY "enteredAt" DESC
  `, { type: QueryTypes.SELECT });
}
