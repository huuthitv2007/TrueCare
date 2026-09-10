/** Staging adapter: not wired into local server. Requires configured Supabase + integration tests. */
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {emptyState,execute,refresh,DomainError,assert} from './domain.js';
import type {AppState,Command} from '../shared/types.js';

export function createSupabaseAdapter(url:string,serviceKey:string){
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 async function ownerOf(jwt:string){const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw new DomainError('AUTH','Phiên đăng nhập không hợp lệ',401);return data.user.id;}
 async function stateOf(owner:string):Promise<AppState>{const {data,error}=await admin.from('employee_states').select('state').eq('owner_id',owner).maybeSingle();if(error)throw new DomainError('STORAGE','Không đọc được dữ liệu',503);if(!data){const state=emptyState();const inserted=await admin.from('employee_states').insert({owner_id:owner,state,version:0});if(inserted.error&&inserted.error.code!=='23505')throw new DomainError('STORAGE','Không khởi tạo được dữ liệu',503);return stateOf(owner)}return refresh(data.state as AppState)}
 async function executeForOwner(owner:string,command:Command){
   assert(typeof command.idempotencyKey==='string'&&command.idempotencyKey.length>=8,'Thiếu khóa chống lặp');
   const fingerprint=createHash('sha256').update(JSON.stringify({type:command.type,payload:command.payload})).digest('hex');
   const prior=await admin.from('command_receipts').select('fingerprint').eq('owner_id',owner).eq('command_key',command.idempotencyKey).maybeSingle();
   if(prior.error)throw new DomainError('STORAGE','Không kiểm tra được khóa chống lặp',503);
   if(prior.data){assert(prior.data.fingerprint===fingerprint,'Khóa chống lặp đã dùng cho dữ liệu khác','CONFLICT');return stateOf(owner)}
   const current=await stateOf(owner);const next=execute(current,command);
   const {data,error}=await admin.rpc('commit_employee_command',{p_owner:owner,p_expected:current.version,p_key:command.idempotencyKey,p_fingerprint:fingerprint,p_state:next});
   if(error)throw new DomainError(error.message.includes('CONFLICT')?'CONFLICT':'STORAGE',error.message.includes('CONFLICT')?'Dữ liệu đã thay đổi. Hãy tải lại.':'Chưa lưu được thao tác',409);
   return refresh(data as AppState);
 }
 async function commitForOwner(owner:string,command:Command,next:AppState){
   assert(command.version!==undefined,'Thiếu phiên bản dữ liệu');assert(typeof command.idempotencyKey==='string'&&command.idempotencyKey.length>=8,'Thiếu khóa chống lặp');
   const fingerprint=createHash('sha256').update(JSON.stringify({type:command.type,payload:command.payload})).digest('hex');
   const {data,error}=await admin.rpc('commit_employee_command',{p_owner:owner,p_expected:command.version,p_key:command.idempotencyKey,p_fingerprint:fingerprint,p_state:next});
   if(error)throw new DomainError(error.message.includes('CONFLICT')?'CONFLICT':'STORAGE',error.message.includes('CONFLICT')?'Dữ liệu đã thay đổi. Vui lòng tải lại.':'Chưa lưu được thao tác',error.message.includes('CONFLICT')?409:503);
   return refresh(data as AppState);
 }
 return {
  async getState(jwt:string){return stateOf(await ownerOf(jwt))},
  async execute(jwt:string,command:Command){return executeForOwner(await ownerOf(jwt),command)},
  async commitState(jwt:string,command:Command,next:AppState){return commitForOwner(await ownerOf(jwt),command,next)},
  getStateForOwner:stateOf,executeForOwner,commitStateForOwner:commitForOwner
 };
}
