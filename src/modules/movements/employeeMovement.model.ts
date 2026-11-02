import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { requireDatabase } from '../../config/database.js';

export type MovementType = 'INGRESO' | 'SALIDA';
export type MovementSource = 'NFC_SIMULADO' | 'NFC_FISICO' | 'BUSQUEDA_MANUAL' | 'VEHICULO_PARTICULAR' | 'VEHICULO_INSTITUCIONAL' | 'CONTINGENCIA';

export class EmployeeMovement extends Model<InferAttributes<EmployeeMovement>, InferCreationAttributes<EmployeeMovement>> {
  declare id: CreationOptional<string>;
  declare employeeId: string;
  declare nfcTagId: string | null;
  declare movementType: MovementType;
  declare source: MovementSource;
  declare confirmedByUserId: string;
  declare clientOperationId: CreationOptional<string | null>;
  declare clientOccurredAt: CreationOptional<Date | null>;
  declare occurredAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

let initialized = false;
export function getEmployeeMovementModel() {
  if (!initialized) {
    EmployeeMovement.init({
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      nfcTagId: { type: DataTypes.UUID, allowNull: true, field: 'nfc_tag_id' },
      movementType: { type: DataTypes.STRING(10), allowNull: false, field: 'movement_type' },
      source: { type: DataTypes.STRING(20), allowNull: false },
      confirmedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'confirmed_by_user_id' },
      clientOperationId: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'client_operation_id' },
      clientOccurredAt: { type: DataTypes.DATE, allowNull: true, field: 'client_occurred_at' },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'occurred_at' },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    }, { sequelize: requireDatabase(), tableName: 'employee_movements', modelName: 'EmployeeMovement' });
    initialized = true;
  }
  return EmployeeMovement;
}
