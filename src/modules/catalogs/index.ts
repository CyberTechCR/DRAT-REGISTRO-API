import { Router } from 'express';

import { ApiError } from '../../errors/ApiError.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { createEmployee, listEmployees, updateEmployee } from './employees/employee.service.js';
import { validateCreateEmployee, validateUpdateEmployee } from './employees/employee.validation.js';
import { createInstitutionalVehicle, listInstitutionalVehicles, updateInstitutionalVehicle } from './institutional-vehicles/institutionalVehicle.service.js';
import { validateCreateInstitutionalVehicle, validateUpdateInstitutionalVehicle } from './institutional-vehicles/institutionalVehicle.validation.js';
import { createPrivateVehicle, listPrivateVehicles, updatePrivateVehicle } from './private-vehicles/privateVehicle.service.js';
import { validateCreatePrivateVehicle, validateUpdatePrivateVehicle } from './private-vehicles/privateVehicle.validation.js';
import { createNfcTag, deleteNfcTag, getNfcTagHistory, listNfcTags, updateNfcTag } from './nfc-tags/nfcTag.service.js';
import { validateCreateNfcTag, validateUpdateNfcTag } from './nfc-tags/nfcTag.validation.js';
import { createPermanentProvider, listPermanentProviders, updatePermanentProvider } from './permanentProvider.service.js';
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from './departments/department.service.js';
import { validateCreateDepartment, validateUpdateDepartment } from './departments/department.validation.js';

export const catalogsModule = { key: 'catalogs', status: 'in_progress' } as const;
export const catalogsRouter = Router();

catalogsRouter.use(authenticate);

catalogsRouter.get('/departments', authorize('ADMINISTRADOR', 'GUARDA'), async (_req, res, next) => {
  try { res.json({ data: await listDepartments() }); } catch (error) { next(error); }
});

catalogsRouter.post('/departments', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { res.status(201).json({ data: await createDepartment(validateCreateDepartment(req.body)) }); } catch (error) { next(error); }
});

catalogsRouter.patch('/departments/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de departamento inválido');
    res.json({ data: await updateDepartment(id, validateUpdateDepartment(req.body)) });
  } catch (error) { next(error); }
});

catalogsRouter.delete('/departments/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de departamento inválido');
    await deleteDepartment(id);
    res.status(204).send();
  } catch (error) { next(error); }
});

catalogsRouter.get('/employees', authorize('ADMINISTRADOR', 'GUARDA'), async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ data: await listEmployees(search) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.post('/employees', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    res.status(201).json({ data: await createEmployee(validateCreateEmployee(req.body)) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.patch('/employees/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de funcionario inválido');
    res.json({ data: await updateEmployee(id, validateUpdateEmployee(req.body)) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.get('/institutional-vehicles', authorize('ADMINISTRADOR', 'GUARDA'), async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ data: await listInstitutionalVehicles(search) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.post('/institutional-vehicles', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    res.status(201).json({ data: await createInstitutionalVehicle(validateCreateInstitutionalVehicle(req.body)) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.patch('/institutional-vehicles/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de vehículo inválido');
    res.json({ data: await updateInstitutionalVehicle(id, validateUpdateInstitutionalVehicle(req.body)) });
  } catch (error) {
    next(error);
  }
});

catalogsRouter.get('/private-vehicles', authorize('ADMINISTRADOR', 'GUARDA'), async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ data: await listPrivateVehicles(search) });
  } catch (error) { next(error); }
});

catalogsRouter.post('/private-vehicles', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    res.status(201).json({ data: await createPrivateVehicle(validateCreatePrivateVehicle(req.body)) });
  } catch (error) { next(error); }
});

catalogsRouter.patch('/private-vehicles/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de vehículo inválido');
    res.json({ data: await updatePrivateVehicle(id, validateUpdatePrivateVehicle(req.body)) });
  } catch (error) { next(error); }
});

catalogsRouter.get('/nfc-tags', authorize('ADMINISTRADOR'), async (_req, res, next) => {
  try { res.json({ data: await listNfcTags() }); } catch (error) { next(error); }
});

catalogsRouter.get('/permanent-providers', authorize('ADMINISTRADOR'), async (_req,res,next)=>{try{res.json({data:await listPermanentProviders()});}catch(error){next(error);}});
catalogsRouter.post('/permanent-providers', authorize('ADMINISTRADOR'), async (req,res,next)=>{try{res.status(201).json({data:await createPermanentProvider(req.body)});}catch(error){next(error);}});
catalogsRouter.put('/permanent-providers/:id', authorize('ADMINISTRADOR'), async (req,res,next)=>{try{const id=typeof req.params.id==='string'?req.params.id:undefined;if(!id)throw new ApiError(400,'Proveedor inválido');res.json({data:await updatePermanentProvider(id,req.body)});}catch(error){next(error);}});

catalogsRouter.post('/nfc-tags', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try { const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado'); res.status(201).json({ data: await createNfcTag(validateCreateNfcTag(req.body), auth.sub) }); } catch (error) { next(error); }
});

catalogsRouter.patch('/nfc-tags/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de TAG inválido');
    const auth = typeof req.auth === 'object' ? req.auth : undefined; if (typeof auth?.sub !== 'string') throw new ApiError(401, 'No autorizado');
    res.json({ data: await updateNfcTag(id, validateUpdateNfcTag(req.body), auth.sub) });
  } catch (error) { next(error); }
});

catalogsRouter.get('/nfc-tags/:id/history', authorize('ADMINISTRADOR'), async (req, res, next) => { try { const id = typeof req.params.id === 'string' ? req.params.id : undefined; if (!id) throw new ApiError(400, 'Identificador de TAG inválido'); res.json({ data: await getNfcTagHistory(id) }); } catch (error) { next(error); } });

catalogsRouter.delete('/nfc-tags/:id', authorize('ADMINISTRADOR'), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') throw new ApiError(400, 'Identificador de TAG inválido');
    await deleteNfcTag(id);
    res.status(204).send();
  } catch (error) { next(error); }
});
