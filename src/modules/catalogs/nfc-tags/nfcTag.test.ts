import { describe, expect, it } from 'vitest';

import { normalizeNfcCode, validateCreateNfcTag, validateUpdateNfcTag } from './nfcTag.validation.js';

const employeeId = '123e4567-e89b-42d3-a456-426614174000';

describe('catálogo de TAG NFC', () => {
  it('normaliza el código antes de buscarlo', () => {
    expect(normalizeNfcCode(' tag-andres-01 ')).toBe('TAG-ANDRES-01');
    expect(normalizeNfcCode('04:DA:68:AB:72:26:81')).toBe('04DA68AB722681');
    expect(normalizeNfcCode('04-DA-68-AB-72-26-81')).toBe('04DA68AB722681');
  });

  it('valida la asociación con un funcionario', () => {
    expect(validateCreateNfcTag({ code: 'tag-001', employeeId })).toEqual({ code: 'TAG-001', employeeId });
  });

  it('permite registrar un TAG disponible para visitantes sin funcionario', () => {
    expect(validateCreateNfcTag({ code: '04:DA:68:AB' })).toEqual({ code: '04DA68AB', employeeId: null });
  });

  it('impide modificar el código del TAG', () => {
    expect(() => validateUpdateNfcTag({ code: 'TAG-002' })).toThrow('El código del TAG NFC no se puede modificar');
  });

  it('permite liberar la asignación sin alterar el identificador', () => {
    expect(validateUpdateNfcTag({ employeeId: null })).toEqual({ employeeId: null });
  });
});
