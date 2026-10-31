import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';
import { getEmployeeModel, type Employee } from '../catalogs/employees/employee.model.js';
import { getInstitutionalVehicleModel } from '../catalogs/institutional-vehicles/institutionalVehicle.model.js';
import { getEmployeeMovementModel, type MovementType } from './employeeMovement.model.js';
import { getInstitutionalVehicleTripModel, type InstitutionalVehicleTrip } from './institutionalVehicleTrip.model.js';

type PersonData = { id: string; identification: string; name: string; department: string; position: string; active: boolean };
export type InstitutionalTripAssetInput = { description: string; quantity: number; identifier?: string; observation?: string };
const personData = (person: Employee): PersonData => ({ id: person.id, identification: person.identification, name: person.name, department: person.department, position: person.position, active: person.active });
const normalize = (value: string) => value.trim().replace(/[\s-]/g, '').toUpperCase();
const soin = (value: string) => { const result = value.trim().toUpperCase(); if (result.length < 2 || result.length > 50) throw new ApiError(400, 'Número de boleta SOIN inválido'); return result; };
const integer = (value: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER) => { if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new ApiError(400, `${field} inválido`); return value; };
const optionalText = (value: unknown, field: string, maximum: number) => { if (value === undefined || value === null || value === '') return null; if (typeof value !== 'string' || value.trim().length > maximum) throw new ApiError(400, `${field} inválido`); return value.trim() || null; };
function validateAssets(value: unknown): InstitutionalTripAssetInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, 'Lista de activos inválida');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new ApiError(400, `Activo ${index + 1} inválido`);
    const record = item as Record<string, unknown>;
    if (typeof record.description !== 'string' || record.description.trim().length < 2 || record.description.trim().length > 200) throw new ApiError(400, `Descripción del activo ${index + 1} inválida`);
    return { description: record.description.trim(), quantity: integer(record.quantity, `Cantidad del activo ${index + 1}`, 1, 999999), identifier: optionalText(record.identifier, `Identificador del activo ${index + 1}`, 100) ?? undefined, observation: optionalText(record.observation, `Observación del activo ${index + 1}`, 500) ?? undefined };
  });
}

async function occupants(tripId: string, transaction?: Transaction) {
  const rows = await requireDatabase().query<{ employee_id: string }>('SELECT employee_id FROM institutional_vehicle_trip_occupants WHERE trip_id = :tripId', { replacements: { tripId }, type: QueryTypes.SELECT, transaction });
  const people = rows.length ? await getEmployeeModel().findAll({ where: { id: rows.map((row) => row.employee_id) }, transaction }) : [];
  return people.map(personData);
}
async function verifyPeople(ids: string[], movement: MovementType, transaction: Transaction) {
  const unique = [...new Set(ids)]; const people = await getEmployeeModel().findAll({ where: { id: unique }, transaction, lock: transaction.LOCK.UPDATE });
  if (people.length !== unique.length) throw new ApiError(404, 'Uno de los funcionarios seleccionados no existe');
  for (const person of people) {
    if (!person.active) throw new ApiError(409, `${person.name} está inactivo`);
    const last = await getEmployeeMovementModel().findOne({ where: { employeeId: person.id }, order: [['occurredAt', 'DESC'], ['createdAt', 'DESC']], transaction });
    const expected: MovementType = last?.movementType === 'INGRESO' ? 'SALIDA' : 'INGRESO';
    if (expected !== movement) throw new ApiError(409, `${person.name} no puede registrar ${movement.toLowerCase()} porque su último estado no coincide`);
  }
  return people;
}
async function detail(trip: InstitutionalVehicleTrip, transaction?: Transaction) {
  const [vehicle, driver, tripOccupants, assets] = await Promise.all([getInstitutionalVehicleModel().findByPk(trip.vehicleId, { transaction }), getEmployeeModel().findByPk(trip.driverEmployeeId, { transaction }), occupants(trip.id, transaction), requireDatabase().query(`SELECT id, description, quantity, identifier, observation FROM institutional_vehicle_trip_assets WHERE trip_id = :tripId ORDER BY created_at, id`, { replacements: { tripId: trip.id }, type: QueryTypes.SELECT, transaction })]);
  return { ...trip.toJSON(), vehicle, driver: driver ? personData(driver) : null, occupants: tripOccupants, assets };
}
export async function resolveInstitutionalDeparture(plate: string) {
  const vehicle = await getInstitutionalVehicleModel().findOne({ where: { plate: normalize(plate) } });
  if (!vehicle) throw new ApiError(404, 'Vehículo institucional no encontrado'); if (!vehicle.active) throw new ApiError(409, 'El vehículo institucional está inactivo');
  if (await getInstitutionalVehicleTripModel().findOne({ where: { vehicleId: vehicle.id, returnAt: { [Op.is]: null } } })) throw new ApiError(409, 'El vehículo ya tiene una salida pendiente de ingreso');
  return { vehicle };
}
export async function createInstitutionalDeparture(input: { plate: string; soinNumber: string; mileage: number; fuel: number; destination: string; driverEmployeeId: string; occupantEmployeeIds: string[]; assets?: InstitutionalTripAssetInput[]; userId: string }) {
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const vehicle = await getInstitutionalVehicleModel().findOne({ where: { plate: normalize(input.plate) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!vehicle || !vehicle.active) throw new ApiError(404, 'Vehículo institucional activo no encontrado');
    if (await getInstitutionalVehicleTripModel().findOne({ where: { vehicleId: vehicle.id, returnAt: { [Op.is]: null } }, transaction })) throw new ApiError(409, 'El vehículo ya tiene una salida pendiente');
    const occupantIds = [...new Set(input.occupantEmployeeIds)]; if (occupantIds.includes(input.driverEmployeeId)) throw new ApiError(409, 'El chofer no puede repetirse como ocupante');
    await verifyPeople([input.driverEmployeeId, ...occupantIds], 'SALIDA', transaction);
    try {
      const trip = await getInstitutionalVehicleTripModel().create({ soinNumber: soin(input.soinNumber), vehicleId: vehicle.id, driverEmployeeId: input.driverEmployeeId, destination: input.destination.trim(), departureMileage: integer(input.mileage, 'Kilometraje', 0), departureFuel: integer(input.fuel, 'Combustible', 0, 100), departureConfirmedByUserId: input.userId }, { transaction });
      if (!trip.destination) throw new ApiError(400, 'Destino requerido');
      for (const employeeId of occupantIds) await requireDatabase().query('INSERT INTO institutional_vehicle_trip_occupants (trip_id, employee_id) VALUES (:tripId, :employeeId)', { replacements: { tripId: trip.id, employeeId }, type: QueryTypes.INSERT, transaction });
      for (const asset of validateAssets(input.assets)) await requireDatabase().query('INSERT INTO institutional_vehicle_trip_assets (trip_id, description, quantity, identifier, observation) VALUES (:tripId, :description, :quantity, :identifier, :observation)', { replacements: { tripId: trip.id, description: asset.description, quantity: asset.quantity, identifier: asset.identifier ?? null, observation: asset.observation ?? null }, type: QueryTypes.INSERT, transaction });
      await getEmployeeMovementModel().bulkCreate([input.driverEmployeeId, ...occupantIds].map((employeeId) => ({ employeeId, nfcTagId: null, movementType: 'SALIDA' as const, source: 'VEHICULO_INSTITUCIONAL' as const, confirmedByUserId: input.userId })), { transaction });
      return detail(trip, transaction);
    } catch (error) { if (error instanceof UniqueConstraintError) throw new ApiError(409, 'La boleta SOIN ya está registrada'); throw error; }
  });
}
export async function resolveInstitutionalReturn(soinNumber: string) {
  const trip = await getInstitutionalVehicleTripModel().findOne({ where: { soinNumber: soin(soinNumber), returnAt: { [Op.is]: null } } });
  if (!trip) throw new ApiError(404, 'No existe un viaje abierto con esa boleta SOIN'); return detail(trip);
}
export async function createInstitutionalReturn(input: { soinNumber: string; mileage: number; fuel: number; userId: string }) {
  return requireDatabase().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE }, async (transaction) => {
    const trip = await getInstitutionalVehicleTripModel().findOne({ where: { soinNumber: soin(input.soinNumber), returnAt: { [Op.is]: null } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!trip) throw new ApiError(404, 'No existe un viaje abierto con esa boleta SOIN'); const returnMileage = integer(input.mileage, 'Kilometraje', 0); const returnFuel = integer(input.fuel, 'Combustible', 0, 100);
    if (returnMileage < trip.departureMileage) throw new ApiError(409, `El kilometraje de ingreso no puede ser menor que ${trip.departureMileage}`);
    const tripOccupants = await occupants(trip.id, transaction); await verifyPeople([trip.driverEmployeeId, ...tripOccupants.map((item) => item.id)], 'INGRESO', transaction);
    await trip.update({ returnMileage, returnFuel, returnAt: new Date(), returnConfirmedByUserId: input.userId }, { transaction });
    await getEmployeeMovementModel().bulkCreate([trip.driverEmployeeId, ...tripOccupants.map((item) => item.id)].map((employeeId) => ({ employeeId, nfcTagId: null, movementType: 'INGRESO' as const, source: 'VEHICULO_INSTITUCIONAL' as const, confirmedByUserId: input.userId })), { transaction }); return detail(trip, transaction);
  });
}
export async function listInstitutionalTrips() { const trips = await getInstitutionalVehicleTripModel().findAll({ order: [['departureAt', 'DESC']] }); return Promise.all(trips.map((trip) => detail(trip))); }
