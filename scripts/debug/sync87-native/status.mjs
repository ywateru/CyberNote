/** Finite safe diagnostic fields only; never copy input-derived error text. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const codes=new Set(['sync_io','sync_invalid_input','sync_corrupt_identity','sync_authentication','sync_expired','sync_revoked','sync_workspace_mismatch','sync_protocol','sync_limit','sync_timeout','sync_stopped','sync_backend','sync_plan_stale','sync_busy','sync_transport','sync_internal','sync_config_invalid','sync_disabled','sync_pairing_incomplete','sync_connection_error']);
const identity=value=>{assert(typeof value==='string'&&value.length<=256);return createHash('sha256').update(value).digest('hex');};
export function safeSyncStatus(value){
  assert(['disabled','paused','listening','connecting','syncing','idle','error'].includes(value.state));
  for(const n of [value.pendingCount,value.conflictCount])assert(Number.isSafeInteger(n)&&n>=0);
  assert(Array.isArray(value.peers)&&value.peers.length<=64);
  return{state:value.state,pendingCount:value.pendingCount,conflictCount:value.conflictCount,error:value.error==null?null:codes.has(value.error)?value.error:'REDACTED_UNKNOWN',workspaceIdSha256:identity(value.workspaceId||''),deviceIdSha256:identity(value.deviceId||''),peers:value.peers.map(p=>{assert(typeof p.connected==='boolean');return{identitySha256:identity(p.id),connected:p.connected,lastSyncPresent:Number.isSafeInteger(p.lastSyncAt)&&p.lastSyncAt>=0};})};
}
