import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { requireDatabase } from '../../../config/database.js';

export class NfcTag extends Model<InferAttributes<NfcTag>, InferCreationAttributes<NfcTag>> {
  declare id: CreationOptional<string>;
  declare code: string;
  declare employeeId: string | null;
  declare active: CreationOptional<boolean>;
  declare condition: CreationOptional<'OPERATIVO' | 'DANADO' | 'PERDIDO' | 'INACTIVO'>;
  declare purpose: CreationOptional<'GENERAL' | 'VISITANTE'>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

let initialized = false;

export function getNfcTagModel() {
  if (!initialized) {
    NfcTag.init({
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      employeeId: { type: DataTypes.UUID, allowNull: true, unique: true, field: 'employee_id' },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      condition: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'OPERATIVO' },
      purpose: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'GENERAL' },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    }, { sequelize: requireDatabase(), tableName: 'nfc_tags', modelName: 'NfcTag' });
    initialized = true;
  }
  return NfcTag;
}
