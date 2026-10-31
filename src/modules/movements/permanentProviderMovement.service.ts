import { QueryTypes, Transaction } from 'sequelize';
import { requireDatabase } from '../../config/database.js';
import { ApiError } from '../../errors/ApiError.js';
import { normalizeNfcCode } from '../catalogs/nfc-tags/nfcTag.validation.js';

type MovementType = 'INGRESO' | 'SALIDA';
type Source = 'NFC_FISICO' | 'PLACA_MANUAL';
type ProviderRow = { providerId:string; identification:string; name:string; company:string; phone:string; active:boolean; vehicleId:string|null; plate:string|null; tagId:string|null; tagCode:string|null };

async function findProvider(input:{code?:string;plate?:string},transaction?:Transaction):Promise<ProviderRow>{
  if (input.code) {
    const [row]=await requireDatabase().query<ProviderRow>(`SELECT pp.id AS "providerId",pp.identification,pp.name,pp.company,pp.phone,pp.active,NULL::uuid AS "vehicleId",NULL::text AS plate,nt.id AS "tagId",nt.code AS "tagCode" FROM permanent_provider_tags ppt JOIN permanent_providers pp ON pp.id=ppt.provider_id JOIN nfc_tags nt ON nt.id=ppt.nfc_tag_id WHERE nt.code=:code AND nt.active=TRUE AND nt.condition='OPERATIVO' AND nt.purpose='GENERAL'`,{replacements:{code:normalizeNfcCode(input.code)},type:QueryTypes.SELECT,transaction});
    if(!row) throw new ApiError(404,'El TAG no pertenece a un proveedor permanente activo y válido'); return row;
  }
  const plate=String(input.plate??'').toUpperCase().replace(/[^A-Z0-9]/g,''); if(plate.length<3) throw new ApiError(400,'Placa inválida');
  const [row]=await requireDatabase().query<ProviderRow>(`SELECT pp.id AS "providerId",pp.identification,pp.name,pp.company,pp.phone,pp.active,ppv.id AS "vehicleId",ppv.plate,NULL::uuid AS "tagId",NULL::text AS "tagCode" FROM permanent_provider_vehicles ppv JOIN permanent_providers pp ON pp.id=ppv.provider_id WHERE ppv.plate=:plate AND ppv.active=TRUE`,{replacements:{plate},type:QueryTypes.SELECT,transaction});
  if(!row) throw new ApiError(404,'La placa no pertenece a un proveedor permanente'); return row;
}

async function resolution(input:{code?:string;plate?:string},transaction?:Transaction){
  const provider=await findProvider(input,transaction); if(!provider.active) throw new ApiError(409,'El proveedor está inactivo y requiere revisión antes de continuar');
  if(transaction) await requireDatabase().query('SELECT id FROM permanent_providers WHERE id=:id FOR UPDATE',{replacements:{id:provider.providerId},type:QueryTypes.SELECT,transaction});
  const [lastMovement]=await requireDatabase().query<{movementType:MovementType;occurredAt:Date}>(`SELECT movement_type AS "movementType",occurred_at AS "occurredAt" FROM permanent_provider_movements WHERE provider_id=:id ORDER BY occurred_at DESC,created_at DESC LIMIT 1`,{replacements:{id:provider.providerId},type:QueryTypes.SELECT,transaction});
  const proposedMovement:MovementType=lastMovement?.movementType==='INGRESO'?'SALIDA':'INGRESO'; return {provider,proposedMovement,lastMovement:lastMovement??null};
}

export async function resolvePermanentProviderMovement(input:{code?:string;plate?:string}){return resolution(input);}
export async function createPermanentProviderMovement(input:{code?:string;plate?:string;movementType:MovementType;source:Source;userId:string}){
  return requireDatabase().transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async(transaction)=>{const resolved=await resolution({code:input.code,plate:input.plate},transaction); if(input.movementType!==resolved.proposedMovement) throw new ApiError(409,`El proveedor ya figura ${resolved.proposedMovement==='SALIDA'?'dentro':'fuera'}; revise la inconsistencia antes de continuar`); const [movement]=await requireDatabase().query<Record<string,unknown>>(`INSERT INTO permanent_provider_movements (provider_id,vehicle_id,nfc_tag_id,movement_type,source,confirmed_by_user_id) VALUES (:providerId,:vehicleId,:tagId,:movementType,:source,:userId) RETURNING id,movement_type AS "movementType",source,occurred_at AS "occurredAt"`,{replacements:{providerId:resolved.provider.providerId,vehicleId:resolved.provider.vehicleId,tagId:resolved.provider.tagId,movementType:input.movementType,source:input.source,userId:input.userId},type:QueryTypes.SELECT,transaction}); return {...movement,provider:resolved.provider};});
}
