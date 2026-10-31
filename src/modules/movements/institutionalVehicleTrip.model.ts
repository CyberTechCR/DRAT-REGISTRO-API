import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { requireDatabase } from '../../config/database.js';

export class InstitutionalVehicleTrip extends Model<InferAttributes<InstitutionalVehicleTrip>, InferCreationAttributes<InstitutionalVehicleTrip>> {
  declare id: CreationOptional<string>; declare soinNumber: string; declare vehicleId: string; declare driverEmployeeId: string;
  declare destination: string; declare departureMileage: number; declare departureFuel: number; declare departureAt: CreationOptional<Date>;
  declare departureConfirmedByUserId: string; declare returnMileage: CreationOptional<number | null>; declare returnFuel: CreationOptional<number | null>;
  declare returnAt: CreationOptional<Date | null>; declare returnConfirmedByUserId: CreationOptional<string | null>;
  declare assetReviewStatus: CreationOptional<'PENDIENTE' | 'RESUELTO' | null>;
  declare createdAt: CreationOptional<Date>; declare updatedAt: CreationOptional<Date>;
}
let initialized = false;
export function getInstitutionalVehicleTripModel() {
  if (!initialized) {
    InstitutionalVehicleTrip.init({
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, soinNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true, field: 'soin_number' },
      vehicleId: { type: DataTypes.UUID, allowNull: false, field: 'vehicle_id' }, driverEmployeeId: { type: DataTypes.UUID, allowNull: false, field: 'driver_employee_id' },
      destination: { type: DataTypes.STRING(200), allowNull: false }, departureMileage: { type: DataTypes.INTEGER, allowNull: false, field: 'departure_mileage' },
      departureFuel: { type: DataTypes.INTEGER, allowNull: false, field: 'departure_fuel' }, departureAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'departure_at' },
      departureConfirmedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'departure_confirmed_by_user_id' }, returnMileage: { type: DataTypes.INTEGER, allowNull: true, field: 'return_mileage' },
      returnFuel: { type: DataTypes.INTEGER, allowNull: true, field: 'return_fuel' }, returnAt: { type: DataTypes.DATE, allowNull: true, field: 'return_at' },
      returnConfirmedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'return_confirmed_by_user_id' }, createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
      assetReviewStatus: { type: DataTypes.STRING(12), allowNull: true, field: 'asset_review_status' },
    }, { sequelize: requireDatabase(), tableName: 'institutional_vehicle_trips', modelName: 'InstitutionalVehicleTrip' }); initialized = true;
  }
  return InstitutionalVehicleTrip;
}
