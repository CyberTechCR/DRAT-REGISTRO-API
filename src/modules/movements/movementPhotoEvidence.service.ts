import { QueryTypes } from 'sequelize';

import { requireDatabase } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../errors/ApiError.js';

export type PhotoMovementType = 'VEHICULO_PARTICULAR' | 'VEHICULO_INSTITUCIONAL' | 'VEHICULO_VISITANTE' | 'PROVEEDOR_PERMANENTE';

const movementTables: Record<PhotoMovementType, string> = {
  VEHICULO_PARTICULAR: 'private_vehicle_movements',
  VEHICULO_INSTITUCIONAL: 'institutional_vehicle_trips',
  VEHICULO_VISITANTE: 'visitor_vehicle_visits',
  PROVEEDOR_PERMANENTE: 'permanent_provider_movements',
};

export async function uploadMovementPhoto(input: { movementType: PhotoMovementType; movementId: string; plate: string; contentType: string; image: Buffer; userId: string }) {
  const table = movementTables[input.movementType];
  if (!table) throw new ApiError(400, 'Tipo de movimiento fotográfico inválido');
  if (!/^[0-9a-f-]{36}$/i.test(input.movementId)) throw new ApiError(400, 'Movimiento inválido');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.contentType)) throw new ApiError(415, 'Formato no permitido. Utilice JPEG, PNG o WEBP');
  if (!input.image.length) throw new ApiError(400, 'La fotografía está vacía');
  if (!env.bunnyStorageZone || !env.bunnyStorageAccessKey || !env.bunnyCdnHostname) throw new ApiError(503, 'El almacenamiento fotográfico todavía no está configurado. Puede continuar usando la placa corregida manualmente');
  const [movement] = await requireDatabase().query<{ id: string }>(`SELECT id FROM ${table} WHERE id = :movementId`, { replacements: { movementId: input.movementId }, type: QueryTypes.SELECT });
  if (!movement) throw new ApiError(404, 'No existe el movimiento al que se desea asociar la fotografía');
  const plate = input.plate.trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (plate.length < 3) throw new ApiError(400, 'Placa inválida para la evidencia');
  const extension = input.contentType === 'image/png' ? 'png' : input.contentType === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `movimientos/${input.movementType.toLowerCase()}/${input.movementId}/${Date.now()}-${plate}.${extension}`;
  const storageEndpoint = env.bunnyStorageEndpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const uploadUrl = `https://${storageEndpoint}/${encodeURIComponent(env.bunnyStorageZone)}/${storagePath}`;
  let response: Response;
  try { response = await fetch(uploadUrl, { method: 'PUT', headers: { AccessKey: env.bunnyStorageAccessKey, 'Content-Type': input.contentType }, body: new Uint8Array(input.image) }); }
  catch { throw new ApiError(502, 'No fue posible conectar con el almacenamiento fotográfico. El movimiento quedó registrado y la evidencia puede reintentarse'); }
  if (!response.ok) throw new ApiError(502, 'Bunny.net rechazó la fotografía. El movimiento quedó registrado y la evidencia puede reintentarse');
  const publicUrl = `https://${env.bunnyCdnHostname.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${storagePath}`;
  const rows = await requireDatabase().query<{ id: string; public_url: string }>(`INSERT INTO movement_photo_evidence(movement_type,movement_id,plate,storage_path,public_url,uploaded_by_user_id) VALUES(:movementType,:movementId,:plate,:storagePath,:publicUrl,:userId) RETURNING id,public_url`, { replacements: { movementType: input.movementType, movementId: input.movementId, plate, storagePath, publicUrl, userId: input.userId }, type: QueryTypes.SELECT });
  const record = rows[0];
  if (!record) throw new ApiError(500, 'La fotografía se almacenó, pero no fue posible guardar su referencia');
  return { id: record.id, url: record.public_url };
}
