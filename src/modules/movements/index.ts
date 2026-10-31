import { Router } from 'express';

import { ApiError } from '../../errors/ApiError.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { createManualMovement, createNfcMovement, getCurrentPresenceCount, getEmergencyPresence, resolveManualMovement, resolveNfcMovement } from './employeeMovement.service.js';
import type { MovementSource, MovementType } from './employeeMovement.model.js';
import { createPrivateVehicleMovement, resolvePrivateVehicleMovement } from './privateVehicleMovement.service.js';
import { createInstitutionalDeparture, createInstitutionalReturn, listInstitutionalTrips, resolveInstitutionalDeparture, resolveInstitutionalReturn } from './institutionalVehicleTrip.service.js';
import { createMovementContingency, type ContingencyEntity } from './movementContingency.service.js';
import { listActiveVisitorVisits, listAvailableVisitorBadges, lookupVisitorByIdentification, registerVisitorEntry, registerVisitorExit } from './visitorVisit.service.js';
import { listMovementHistory, validateHistoryFilters } from './movementHistory.service.js';
import { registerVisitorVehicleEntry } from './visitorVehicleVisit.service.js';

export const movementsModule = { key: 'movements', status: 'in_progress' } as const;
export const movementsRouter = Router();

movementsRouter.use(authenticate, authorize('ADMINISTRADOR', 'GUARDA'));

movementsRouter.post('/employees/nfc/resolve', async (req, res, next) => {
  try {
    if (typeof req.body?.code !== 'string') throw new ApiError(400, 'Código NFC requerido');
    res.json({ data: await resolveNfcMovement(req.body.code) });
  } catch (error) { next(error); }
});

movementsRouter.post('/employees/nfc', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (!['INGRESO', 'SALIDA'].includes(req.body?.movementType)) throw new ApiError(400, 'Tipo de movimiento inválido');
    if (!['NFC_SIMULADO', 'NFC_FISICO'].includes(req.body?.source)) throw new ApiError(400, 'Origen del movimiento inválido');
    res.status(201).json({ data: await createNfcMovement({ code: req.body.code, movementType: req.body.movementType as MovementType, source: req.body.source as MovementSource, confirmedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.post('/employees/manual/resolve', async (req, res, next) => {
  try {
    if (typeof req.body?.employeeId !== 'string') throw new ApiError(400, 'Funcionario requerido');
    res.json({ data: await resolveManualMovement(req.body.employeeId) });
  } catch (error) { next(error); }
});

movementsRouter.post('/employees/manual', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (typeof req.body?.employeeId !== 'string') throw new ApiError(400, 'Funcionario requerido');
    if (!['INGRESO', 'SALIDA'].includes(req.body?.movementType)) throw new ApiError(400, 'Tipo de movimiento inválido');
    res.status(201).json({ data: await createManualMovement({ employeeId: req.body.employeeId, movementType: req.body.movementType as MovementType, confirmedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.get('/employees/presence/count', async (_req, res, next) => {
  try { res.json({ data: { count: await getCurrentPresenceCount() } }); } catch (error) { next(error); }
});

movementsRouter.get('/presence/emergency', async (_req, res, next) => {
  try { res.json({ data: await getEmergencyPresence() }); } catch (error) { next(error); }
});

movementsRouter.get('/history', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { res.json({ data: await listMovementHistory(validateHistoryFilters(req.query)) }); } catch (error) { next(error); }
});

movementsRouter.post('/visitors/entry', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    res.status(201).json({ data: await registerVisitorEntry({ ...req.body, userId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.get('/visitors/active', async (req, res, next) => {
  try { res.json({ data: await listActiveVisitorVisits(typeof req.query.search === 'string' ? req.query.search : '') }); } catch (error) { next(error); }
});

movementsRouter.get('/visitors/identity', async (req, res, next) => {
  try {
    if (typeof req.query.identification !== 'string') throw new ApiError(400, 'Identificación requerida');
    res.json({ data: await lookupVisitorByIdentification(req.query.identification) });
  } catch (error) { next(error); }
});

movementsRouter.get('/visitors/badges/available', async (_req, res, next) => {
  try { res.json({ data: await listAvailableVisitorBadges() }); } catch (error) { next(error); }
});

movementsRouter.post('/visitors/:id/exit', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    res.json({ data: await registerVisitorExit(req.params.id, auth.sub) });
  } catch (error) { next(error); }
});

movementsRouter.post('/visitor-vehicles/entry', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    res.status(201).json({ data: await registerVisitorVehicleEntry({ plate: req.body?.plate, occupants: req.body?.occupants, userId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.post('/private-vehicles/resolve', async (req, res, next) => {
  try {
    if (typeof req.body?.plate !== 'string') throw new ApiError(400, 'Placa requerida');
    res.json({ data: await resolvePrivateVehicleMovement(req.body.plate) });
  } catch (error) { next(error); }
});

movementsRouter.post('/private-vehicles', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (typeof req.body?.plate !== 'string') throw new ApiError(400, 'Placa requerida');
    const employeeDriver = typeof req.body?.driverEmployeeId === 'string';
    const visitorDriver = typeof req.body?.driverVisitorVisitId === 'string';
    if (employeeDriver === visitorDriver) throw new ApiError(400, 'Debe indicar exactamente un conductor funcionario o visitante');
    if (!Array.isArray(req.body?.occupantEmployeeIds) || !req.body.occupantEmployeeIds.every((id: unknown) => typeof id === 'string')) throw new ApiError(400, 'La lista de acompañantes es inválida');
    if (!['INGRESO', 'SALIDA'].includes(req.body?.movementType)) throw new ApiError(400, 'Tipo de movimiento inválido');
    if (!['PLACA_MANUAL', 'OCR'].includes(req.body?.source)) throw new ApiError(400, 'Origen de placa inválido');
    res.status(201).json({ data: await createPrivateVehicleMovement({ plate: req.body.plate, driverEmployeeId: employeeDriver ? req.body.driverEmployeeId : undefined, driverVisitorVisitId: visitorDriver ? req.body.driverVisitorVisitId : undefined, ownerAuthorizationConfirmed: req.body.ownerAuthorizationConfirmed, authorizationNote: req.body.authorizationNote, occupantEmployeeIds: req.body.occupantEmployeeIds, movementType: req.body.movementType as MovementType, source: req.body.source, confirmedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.post('/institutional-vehicles/departure/resolve', async (req, res, next) => {
  try { if (typeof req.body?.plate !== 'string') throw new ApiError(400, 'Placa requerida'); res.json({ data: await resolveInstitutionalDeparture(req.body.plate) }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/departure', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (typeof req.body?.plate !== 'string' || typeof req.body?.soinNumber !== 'string' || typeof req.body?.driverEmployeeId !== 'string' || typeof req.body?.destination !== 'string' || !Array.isArray(req.body?.occupantEmployeeIds)) throw new ApiError(400, 'Datos de salida incompletos');
    res.status(201).json({ data: await createInstitutionalDeparture({ ...req.body, userId: auth.sub }) });
  } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/return/resolve', async (req, res, next) => {
  try { if (typeof req.body?.soinNumber !== 'string') throw new ApiError(400, 'Boleta SOIN requerida'); res.json({ data: await resolveInstitutionalReturn(req.body.soinNumber) }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/return', async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof req.body?.soinNumber !== 'string') throw new ApiError(400, 'Boleta SOIN requerida'); res.status(201).json({ data: await createInstitutionalReturn({ soinNumber: req.body.soinNumber, mileage: req.body.mileage, fuel: req.body.fuel, userId: auth.sub }) }); } catch (error) { next(error); }
});
movementsRouter.get('/institutional-vehicles/history', async (_req, res, next) => {
  try { res.json({ data: await listInstitutionalTrips() }); } catch (error) { next(error); }
});

movementsRouter.post('/contingencies', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (!['FUNCIONARIO', 'VEHICULO_PARTICULAR'].includes(req.body?.entityType) || typeof req.body?.entityId !== 'string' || !['INGRESO', 'SALIDA'].includes(req.body?.movementType)) throw new ApiError(400, 'Datos de contingencia inválidos');
    res.status(201).json({ data: await createMovementContingency({ entityType: req.body.entityType as ContingencyEntity, entityId: req.body.entityId, movementType: req.body.movementType as MovementType, reason: req.body.reason, authorizedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});
