import { QueryTypes } from 'sequelize';
import { requireDatabase } from '../../config/database.js';
import { getCurrentPresenceCount } from './employeeMovement.service.js';
import { listMovementHistory } from './movementHistory.service.js';
type CountRow={count:string|number};
async function count(sql:string){const [row]=await requireDatabase().query<CountRow>(sql,{type:QueryTypes.SELECT});return Number(row?.count??0);}
export async function getDashboardSummary(){const [peoplePresent,vehiclesInside,activeVisits,pendingAlerts,history]=await Promise.all([
  getCurrentPresenceCount(),
  count(`SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT ON (vehicle_id) vehicle_id,movement_type FROM private_vehicle_movements ORDER BY vehicle_id,occurred_at DESC,created_at DESC) latest WHERE movement_type='INGRESO') + (SELECT COUNT(*) FROM institutional_vehicle_trips WHERE return_at IS NULL) + (SELECT COUNT(*) FROM visitor_vehicle_visits WHERE exit_at IS NULL) + (SELECT COUNT(*) FROM (SELECT DISTINCT ON (vehicle_id) vehicle_id,movement_type FROM permanent_provider_movements WHERE vehicle_id IS NOT NULL ORDER BY vehicle_id,occurred_at DESC,created_at DESC) latest WHERE movement_type='INGRESO') AS count`),
  count(`SELECT COUNT(*) AS count FROM visitor_visits WHERE exit_at IS NULL`),
  count(`SELECT (SELECT COUNT(*) FROM manual_movement_reviews WHERE status='PENDIENTE') + (SELECT COUNT(*) FROM visitor_visits WHERE administrative_review_status='PENDIENTE') + (SELECT COUNT(*) FROM visitor_visits WHERE badge_return_pending=TRUE) + (SELECT COUNT(*) FROM institutional_vehicle_trips WHERE asset_review_status='PENDIENTE') AS count`),
  listMovementHistory({type:undefined,state:undefined,from:undefined,to:undefined}),
]);return {peoplePresent,vehiclesInside,activeVisits,pendingAlerts,recentMovements:history.slice(0,5),generatedAt:new Date()};}
