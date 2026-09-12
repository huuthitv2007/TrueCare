import { z } from 'zod';
// Avoid Zod's eval probe and JIT compilation under the production CSP.
z.config({ jitless: true });
const line=z.object({id:z.string(),productId:z.string(),quantity:z.number().finite().nonnegative(),price:z.string(),kind:z.enum(['sale','gift','display']),sponsor:z.enum(['employee','company']),discount:z.string(),fixedPrice:z.boolean(),delivered:z.number().optional(),returned:z.number().optional()});
const schema=z.object({customerId:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().max(10000),lines:z.array(line).max(500),version:z.number().optional()});
export function readOrderDraft(key:string,version?:number){
 try {const parsed=schema.safeParse(JSON.parse(sessionStorage.getItem(key)||'null'));return parsed.success&&parsed.data.version===version?parsed.data:null;}catch{return null;}
}
export function discardOrderDraft(key:string){try{sessionStorage.removeItem(key);}catch{/* Browser storage is optional. */}}
