import { describe, expect, it } from 'vitest';

import { validateVehiclePlateReportFilters } from './vehiclePlateReport.service.js';

describe('filtros del reporte por placa', () => {
  it('normaliza la placa y acepta un rango inclusivo', () => {
    const filters = validateVehiclePlateReportFilters({ plate: ' abc-123 ', from: '2026-10-01', to: '2026-10-31' });
    expect(filters.plate).toBe('ABC123');
    expect(filters.from.getTime()).toBeLessThan(filters.to.getTime());
  });

  it('exige placa y ambas fechas', () => {
    expect(() => validateVehiclePlateReportFilters({ from: '2026-10-01', to: '2026-10-31' })).toThrow('Placa requerida');
    expect(() => validateVehiclePlateReportFilters({ plate: 'ABC123', from: '2026-10-01' })).toThrow('Fecha final inválida');
  });

  it('rechaza un rango invertido', () => {
    expect(() => validateVehiclePlateReportFilters({ plate: 'ABC123', from: '2026-11-01', to: '2026-10-01' })).toThrow('fecha inicial');
  });
});
