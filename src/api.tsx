import { createContext, useContext } from 'react';
import type { AppState, EmployeeAccount, User } from '../shared/types';
export class ApiError extends Error {
 constructor(public code:string, message:string, public status:number) { super(message); this.name='ApiError'; }
}
export async function trashOne(resource:'customers'|'products', id:string, reason:string, idempotencyKey:string) {
 const result=await request<{results:{id:string;status:string;message:string}[]}>(`/api/admin/${resource}/bulk-actions`,{action:'trash',items:[{id}],reason,idempotencyKey});
 const item=result.results?.find(row=>row.id===id);
 if(item?.status!=='success') throw new ApiError('REFERENCED',item?.message||'Không thể chuyển dữ liệu vào Thùng rác.',409);
}
export async function request<T=any>(path:string, body?:unknown, method?:string):Promise<T> {
 const key=body&&typeof body==='object'&&'idempotencyKey' in body?String((body as any).idempotencyKey):'';
 let response:Response;
 try {response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),credentials:'include',headers:body===undefined?undefined:{'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
 catch {throw new ApiError('NETWORK_ERROR','Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',0);}
 const result=await response.json().catch(()=>{throw new ApiError('INVALID_RESPONSE','Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.',response.status);});
 if(!response.ok) {
  const message=typeof result.error==='string'?result.error:result.error?.message||result.message||'Không thực hiện được. Vui lòng thử lại.';
  const code=typeof result.error==='object'&&result.error?.code?String(result.error.code):`HTTP_${response.status}`;
  if(code==='SESSION_EXPIRED') window.dispatchEvent(new CustomEvent('truecare:session-expired'));
  throw new ApiError(code,message,response.status);
 }
 return result;
}
export interface WorkspaceContext {state:AppState;user:User;command:(type:string,payload:unknown)=>Promise<AppState>;workspaceRequest:<T=any>(path:string,body?:unknown,method?:string)=>Promise<T>;refresh:()=>Promise<void>;notify:(message:string)=>void;busy:boolean;adminTarget:EmployeeAccount|null;setAdminTarget:(target:EmployeeAccount|null)=>void;adminReason:string;setAdminReason:(reason:string)=>void}
export const AppContext=createContext<WorkspaceContext|null>(null);
export function useWorkspace(){const ctx=useContext(AppContext);if(!ctx)throw new Error('Thiếu phiên làm việc');return ctx}
