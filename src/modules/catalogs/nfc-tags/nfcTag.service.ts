import { QueryTypes, UniqueConstraintError } from 'sequelize';

import { ApiError } from '../../../errors/ApiError.js';
import { requireDatabase } from '../../../config/database.js';
import { getEmployeeMovementModel } from '../../movements/employeeMovement.model.js';
import { getEmployeeModel } from '../employees/employee.model.js';
import { getNfcTagModel, type NfcTag } from './nfcTag.model.js';

async function requireActiveEmployee(id: string) {
  const employee = await getEmployeeModel().findByPk(id);
  if (!employee) throw new ApiError(404, 'Funcionario no encontrado');
  if (!employee.active) throw new ApiError(409, 'No se puede asociar el TAG porque el funcionario está inactivo');
  return employee;
}

async function withEmployee(tag: NfcTag): Promise<Record<string, unknown>> {
  const employee = tag.employeeId
    ? await getEmployeeModel().findByPk(tag.employeeId, { attributes: ['id', 'identification', 'name', 'department', 'position', 'active'] })
    : null;
  const [visitorAssignment] = await requireDatabase().query<{ name: string }>(`SELECT v.name FROM visitor_visits vv JOIN visitors v ON v.id = vv.visitor_id WHERE vv.badge_code = :code AND vv.exit_at IS NULL LIMIT 1`, { replacements: { code: tag.code }, type: QueryTypes.SELECT });
  const [providerAssignment] = await requireDatabase().query<{ name: string }>(`SELECT pp.name FROM permanent_provider_tags ppt JOIN permanent_providers pp ON pp.id=ppt.provider_id WHERE ppt.nfc_tag_id=:id LIMIT 1`,{replacements:{id:tag.id},type:QueryTypes.SELECT});
  const operationalStatus = tag.condition !== 'OPERATIVO' ? tag.condition : (employee || visitorAssignment || providerAssignment ? 'ASIGNADO' : 'DISPONIBLE');
  return { ...tag.toJSON(), employee, visitorAssignment: visitorAssignment ?? null, providerAssignment: providerAssignment ?? null, operationalStatus };
}

export async function listNfcTags() {
  const tags = await getNfcTagModel().findAll({ order: [['createdAt', 'DESC']] });
  return Promise.all(tags.map(withEmployee));
}

export async function createNfcTag(input: { code: string; employeeId: string | null; purpose: 'GENERAL' | 'VISITANTE' }, userId?: string) {
  if (input.employeeId) await requireActiveEmployee(input.employeeId);
  try { const tag = await getNfcTagModel().create(input); if (userId) await recordHistory(tag.id, 'CREADO', input.purpose === 'VISITANTE' ? 'Gafete creado para visitantes' : input.employeeId ? 'TAG creado y asignado a funcionario' : 'TAG general creado', userId); return withEmployee(tag); }
  catch (error) {
    if (error instanceof UniqueConstraintError) throw new ApiError(409, 'El TAG está duplicado o el funcionario ya tiene un TAG asociado');
    throw error;
  }
}

export async function updateNfcTag(id: string, input: { employeeId?: string | null; active?: boolean; condition?: 'OPERATIVO' | 'DANADO' | 'PERDIDO' | 'INACTIVO' }, userId?: string) {
  const tag = await getNfcTagModel().findByPk(id);
  if (!tag) throw new ApiError(404, 'TAG NFC no encontrado');
  const employeeId = input.employeeId === undefined ? tag.employeeId : input.employeeId;
  if (employeeId && ((input.employeeId !== undefined && input.employeeId !== null) || input.active === true)) await requireActiveEmployee(employeeId);
  const update = input.condition ? { ...input, active: input.condition === 'OPERATIVO' } : input.employeeId === null ? { ...input, active: true } : input;
  try { await tag.update(update); if (userId) await recordHistory(tag.id, 'ACTUALIZADO', `Estado: ${tag.condition}; asignación: ${tag.employeeId ?? 'visitantes'}`, userId); return withEmployee(tag); }
  catch (error) {
    if (error instanceof UniqueConstraintError) throw new ApiError(409, 'El funcionario ya tiene un TAG asociado');
    throw error;
  }
}

async function recordHistory(tagId: string, event: string, detail: string, userId: string) { await requireDatabase().query(`INSERT INTO nfc_tag_history (nfc_tag_id, event, detail, changed_by_user_id) VALUES (:tagId, :event, :detail, :userId)`, { replacements: { tagId, event, detail, userId }, type: QueryTypes.INSERT }); }

export async function getNfcTagHistory(id: string) {
  return requireDatabase().query<{ id: string; event: string; detail: string; occurredAt: Date; changedBy: string }>(`SELECT h.id, h.event, h.detail, h.occurred_at AS "occurredAt", u.name AS "changedBy" FROM nfc_tag_history h JOIN users u ON u.id = h.changed_by_user_id WHERE h.nfc_tag_id = :id ORDER BY h.occurred_at DESC`, { replacements: { id }, type: QueryTypes.SELECT });
}

export async function deleteNfcTag(id: string) {
  const tag = await getNfcTagModel().findByPk(id);
  if (!tag) throw new ApiError(404, 'TAG NFC no encontrado');
  if (tag.employeeId) throw new ApiError(409, 'No se puede eliminar el TAG porque tiene un funcionario asignado');
  const movementCount = await getEmployeeMovementModel().count({ where: { nfcTagId: id } });
  if (movementCount > 0) throw new ApiError(409, 'No se puede eliminar el TAG porque posee movimientos históricos');
  const [visitorUse] = await requireDatabase().query<{ count: string }>('SELECT COUNT(*)::text AS count FROM visitor_visits WHERE badge_code = :code', { replacements: { code: tag.code }, type: QueryTypes.SELECT });
  if (Number(visitorUse?.count ?? 0) > 0) throw new ApiError(409, 'No se puede eliminar el TAG porque posee historial de visitantes');
  await tag.destroy();
}
