import { raw, Router } from 'express';

import { ApiError } from '../../errors/ApiError.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { createManualMovement, createNfcMovement, decideManualMovementReview, getCurrentPresenceCount, getEmergencyPresence, listPendingManualMovementReviews, resolveManualMovement, resolveManualMovementReview, resolveNfcMovement } from './employeeMovement.service.js';
import type { MovementSource, MovementType } from './employeeMovement.model.js';
import { createPrivateVehicleMovement, resolvePrivateVehicleMovement } from './privateVehicleMovement.service.js';
import { createInstitutionalDeparture, createInstitutionalReturn, decideInstitutionalAssetReview, listInstitutionalTrips, listPendingInstitutionalAssetReviews, resolveInstitutionalAssetReview, resolveInstitutionalDeparture, resolveInstitutionalReturn } from './institutionalVehicleTrip.service.js';
import { createMovementContingency, type ContingencyEntity } from './movementContingency.service.js';
import { listActiveVisitorVisits, listAvailableVisitorBadges, listPendingBadgeReturns, listPendingVisitorBadgeContingencies, lookupVisitorByIdentification, registerVisitorEntry, registerVisitorEntryWithoutBadge, registerVisitorExit, resolveLegacyBadgeReturn, resolvePendingBadgeReturn, resolveVisitorBadgeContingency } from './visitorVisit.service.js';
import { listMovementHistory, validateHistoryFilters } from './movementHistory.service.js';
import { registerVisitorVehicleEntry } from './visitorVehicleVisit.service.js';
import { createPermanentProviderMovement, resolvePermanentProviderMovement } from './permanentProviderMovement.service.js';
import { uploadMovementPhoto, type PhotoMovementType } from './movementPhotoEvidence.service.js';

export const movementsModule = { key: 'movements', status: 'in_progress' } as const;
export const movementsRouter = Router();

movementsRouter.use(authenticate, authorize('ADMINISTRADOR', 'GUARDA'));

movementsRouter.post('/evidence/photos', raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'Fotografía requerida');
    const movementType = req.query.movementType;
    const movementId = req.query.movementId;
    const plate = req.query.plate;
    if (typeof movementType !== 'string' || typeof movementId !== 'string' || typeof plate !== 'string') throw new ApiError(400, 'Referencia del movimiento incompleta');
    res.status(201).json({ data: await uploadMovementPhoto({ movementType: movementType as PhotoMovementType, movementId, plate, contentType: req.headers['content-type'] ?? '', image: req.body, userId: auth.sub }) });
  } catch (error) { next(error); }
});

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
    res.status(201).json({ data: await createNfcMovement({ code: req.body.code, movementType: req.body.movementType as MovementType, source: req.body.source as MovementSource, confirmedByUserId: auth.sub, clientOperationId: req.body.clientOperationId, clientOccurredAt: req.body.clientOccurredAt }) });
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
    res.status(201).json({ data: await createManualMovement({ employeeId: req.body.employeeId, movementType: req.body.movementType as MovementType, reason: req.body.reason, confirmedByUserId: auth.sub, clientOperationId: req.body.clientOperationId, clientOccurredAt: req.body.clientOccurredAt }) });
  } catch (error) { next(error); }
});
movementsRouter.get('/employees/manual/reviews/pending', authorize('ADMINISTRADOR'), async (_req, res, next) => {
  try { res.json({ data: await listPendingManualMovementReviews() }); } catch (error) { next(error); }
});
movementsRouter.post('/employees/manual/reviews/:id/resolve', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; const id = req.params.id; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof id !== 'string') throw new ApiError(400, 'Revisión inválida'); res.json({ data: await resolveManualMovementReview(id, req.body?.note, auth.sub) }); } catch (error) { next(error); }
});
movementsRouter.post('/employees/manual/reviews/:id/decision', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; const id = req.params.id; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof id !== 'string') throw new ApiError(400, 'Revisión inválida'); res.json({ data: await decideManualMovementReview(id, req.body?.decision, req.body?.note, auth.sub) }); } catch (error) { next(error); }
});

movementsRouter.get('/employees/presence/count', async (_req, res, next) => {
  try { res.json({ data: { count: await getCurrentPresenceCount() } }); } catch (error) { next(error); }
});

movementsRouter.get('/presence/emergency', async (_req, res, next) => {
  try { res.json({ data: await getEmergencyPresence() }); } catch (error) { next(error); }
});

movementsRouter.post('/permanent-providers/resolve', async (req,res,next)=>{try{const code=typeof req.body?.code==='string'?req.body.code:undefined;const plate=typeof req.body?.plate==='string'?req.body.plate:undefined;if(Boolean(code)===Boolean(plate))throw new ApiError(400,'Indique exactamente un TAG o una placa');res.json({data:await resolvePermanentProviderMovement({code,plate})});}catch(error){next(error);}});
movementsRouter.post('/permanent-providers', async (req,res,next)=>{try{const auth=typeof req.auth==='object'?req.auth:undefined;if(typeof auth?.sub!=='string')throw new ApiError(401,'No autorizado');const code=typeof req.body?.code==='string'?req.body.code:undefined;const plate=typeof req.body?.plate==='string'?req.body.plate:undefined;if(Boolean(code)===Boolean(plate))throw new ApiError(400,'Indique exactamente un TAG o una placa');if(!['INGRESO','SALIDA'].includes(req.body?.movementType))throw new ApiError(400,'Tipo de movimiento inválido');const source=code?'NFC_FISICO':'PLACA_MANUAL';res.status(201).json({data:await createPermanentProviderMovement({code,plate,movementType:req.body.movementType,source,userId:auth.sub})});}catch(error){next(error);}});

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

movementsRouter.post('/visitors/entry/badge-contingency',async(req,res,next)=>{try{const auth=typeof req.auth==='object'?req.auth:undefined;if(typeof auth?.sub!=='string')throw new ApiError(401,'No autorizado');res.status(201).json({data:await registerVisitorEntryWithoutBadge({...req.body,userId:auth.sub})});}catch(error){next(error);}});
movementsRouter.get('/visitors/badge-contingencies/pending',authorize('ADMINISTRADOR'),async(_req,res,next)=>{try{res.json({data:await listPendingVisitorBadgeContingencies()});}catch(error){next(error);}});
movementsRouter.post('/visitors/badge-contingencies/:id/resolve',authorize('ADMINISTRADOR'),async(req,res,next)=>{try{const auth=typeof req.auth==='object'?req.auth:undefined;const id=req.params.id;if(typeof auth?.sub!=='string')throw new ApiError(401,'No autorizado');if(typeof id!=='string')throw new ApiError(400,'Contingencia inválida');res.json({data:await resolveVisitorBadgeContingency(id,req.body?.note,auth.sub)});}catch(error){next(error);}});

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

movementsRouter.get('/visitors/badges/pending', async (_req, res, next) => {
  try { res.json({ data: await listPendingBadgeReturns() }); } catch (error) { next(error); }
});

movementsRouter.post('/visitors/:id/exit', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    res.json({ data: await registerVisitorExit(req.params.id, auth.sub, typeof req.body?.badgeCode === 'string' ? req.body.badgeCode : undefined) });
  } catch (error) { next(error); }
});

movementsRouter.post('/visitors/:id/badge-return', async (req, res, next) => {
  try { if (typeof req.body?.badgeCode !== 'string') throw new ApiError(400, 'Código NFC requerido'); res.json({ data: await resolvePendingBadgeReturn(req.params.id, req.body.badgeCode) }); } catch (error) { next(error); }
});

movementsRouter.post('/visitors/:id/badge-return/legacy-resolution', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; const visitId = typeof req.params.id === 'string' ? req.params.id : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (!visitId) throw new ApiError(400, 'Visita requerida'); res.json({ data: await resolveLegacyBadgeReturn(visitId, auth.sub) }); } catch (error) { next(error); }
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
    res.status(201).json({ data: await createPrivateVehicleMovement({ plate: req.body.plate, driverEmployeeId: employeeDriver ? req.body.driverEmployeeId : undefined, driverVisitorVisitId: visitorDriver ? req.body.driverVisitorVisitId : undefined, ownerAuthorizationConfirmed: req.body.ownerAuthorizationConfirmed, authorizationNote: req.body.authorizationNote, occupantEmployeeIds: req.body.occupantEmployeeIds, movementType: req.body.movementType as MovementType, source: req.body.source, manualReason: req.body.manualReason, confirmedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});

movementsRouter.post('/institutional-vehicles/departure/resolve', async (req, res, next) => {
  try { if (typeof req.body?.plate !== 'string') throw new ApiError(400, 'Placa requerida'); res.json({ data: await resolveInstitutionalDeparture(req.body.plate) }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/departure', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (typeof req.body?.plate !== 'string' || typeof req.body?.soinNumber !== 'string' || typeof req.body?.driverEmployeeId !== 'string' || typeof req.body?.destination !== 'string' || !Array.isArray(req.body?.occupantEmployeeIds) || (req.body?.assets !== undefined && !Array.isArray(req.body.assets))) throw new ApiError(400, 'Datos de salida incompletos');
    res.status(201).json({ data: await createInstitutionalDeparture({ ...req.body, userId: auth.sub }) });
  } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/return/resolve', async (req, res, next) => {
  try { if (typeof req.body?.soinNumber !== 'string') throw new ApiError(400, 'Boleta SOIN requerida'); res.json({ data: await resolveInstitutionalReturn(req.body.soinNumber) }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/return', async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof req.body?.soinNumber !== 'string' || (req.body?.assets !== undefined && !Array.isArray(req.body.assets))) throw new ApiError(400, 'Boleta SOIN requerida'); res.status(201).json({ data: await createInstitutionalReturn({ soinNumber: req.body.soinNumber, mileage: req.body.mileage, fuel: req.body.fuel, assets: req.body.assets, userId: auth.sub }) }); } catch (error) { next(error); }
});
movementsRouter.get('/institutional-vehicles/history', async (_req, res, next) => {
  try { res.json({ data: await listInstitutionalTrips() }); } catch (error) { next(error); }
});
movementsRouter.get('/institutional-vehicles/asset-reviews/pending', authorize('ADMINISTRADOR'), async (_req, res, next) => {
  try { res.json({ data: await listPendingInstitutionalAssetReviews() }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/asset-reviews/:id/resolve', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; const id = req.params.id; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof id !== 'string') throw new ApiError(400, 'Revisión inválida'); res.json({ data: await resolveInstitutionalAssetReview(id, req.body?.note, auth.sub) }); } catch (error) { next(error); }
});
movementsRouter.post('/institutional-vehicles/asset-reviews/:id/decision', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; const id = req.params.id; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); if (typeof id !== 'string') throw new ApiError(400, 'Revisión inválida'); res.json({ data: await decideInstitutionalAssetReview(id, req.body?.decision, req.body?.justification, auth.sub) }); } catch (error) { next(error); }
});

movementsRouter.post('/contingencies', async (req, res, next) => {
  try {
    const auth = typeof req.auth === 'object' ? req.auth : undefined;
    if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    if (!['FUNCIONARIO', 'VEHICULO_PARTICULAR'].includes(req.body?.entityType) || typeof req.body?.entityId !== 'string' || !['INGRESO', 'SALIDA'].includes(req.body?.movementType)) throw new ApiError(400, 'Datos de contingencia inválidos');
    res.status(201).json({ data: await createMovementContingency({ entityType: req.body.entityType as ContingencyEntity, entityId: req.body.entityId, movementType: req.body.movementType as MovementType, reason: req.body.reason, authorizedByReference:req.body.authorizedByReference, observations:req.body.observations, authorizedByUserId: auth.sub }) });
  } catch (error) { next(error); }
});
