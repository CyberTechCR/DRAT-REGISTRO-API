import { ApiError } from '../../../errors/ApiError.js';

function code(value: unknown) {
  if (typeof value !== 'string') throw new ApiError(400, 'Código NFC requerido');
  const compact = value.trim().replace(/\s+/g, '').toUpperCase();
  const normalized = /^(?:[0-9A-F]{2}[:-]){3,9}[0-9A-F]{2}$/.test(compact)
    ? compact.replace(/[:-]/g, '')
    : compact;
  if (normalized.length < 4 || normalized.length > 80 || !/^[A-Z0-9:_-]+$/.test(normalized)) {
    throw new ApiError(400, 'Código NFC inválido');
  }
  return normalized;
}

function employeeId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new ApiError(400, 'Funcionario inválido');
  return value;
}

export function validateCreateNfcTag(body: unknown) {
  const value = body as Record<string, unknown>;
  return { code: code(value.code), employeeId: value.employeeId === null || value.employeeId === undefined ? null : employeeId(value.employeeId) };
}

export function validateUpdateNfcTag(body: unknown) {
  const value = body as Record<string, unknown>;
  const result: { employeeId?: string | null; active?: boolean } = {};
  if ('code' in value) throw new ApiError(400, 'El código del TAG NFC no se puede modificar');
  if ('employeeId' in value) result.employeeId = value.employeeId === null ? null : employeeId(value.employeeId);
  if ('active' in value) {
    if (typeof value.active !== 'boolean') throw new ApiError(400, 'El estado del TAG es inválido');
    result.active = value.active;
  }
  if (!Object.keys(result).length) throw new ApiError(400, 'Debe indicar al menos un campo para actualizar');
  return result;
}

export const normalizeNfcCode = code;
