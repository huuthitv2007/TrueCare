import { createContext, useContext } from 'react';
import type { AppState, EmployeeAccount, User } from '../shared/types';
export async function request<T=any>(path:string, body?:unknown, method?:string):Promise<T> {
 const response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),credentials:'include',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:'Máy chủ trả về dữ liệu không hợp lệ.'}));
 if(!response.ok) throw new Error(typeof result.error==='string'?result.error:result.error?.message||result.message||'Không thực hiện được. Vui lòng thử lại.');
 return result;
}
export interface WorkspaceContext {state:AppState;user:User;command:(type:string,payload:unknown)=>Promise<AppState>;refresh:()=>Promise<void>;notify:(message:string)=>void;busy:boolean;adminTarget:EmployeeAccount|null;setAdminTarget:(target:EmployeeAccount|null)=>void;adminReason:string;setAdminReason:(reason:string)=>void}
export const AppContext=createContext<WorkspaceContext|null>(null);
export function useWorkspace(){const ctx=useContext(AppContext);if(!ctx)throw new Error('Thiếu phiên làm việc');return ctx}
