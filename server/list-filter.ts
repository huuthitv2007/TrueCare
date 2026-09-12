import { assert } from './domain.js';
export function readListFilter(query:Record<string,unknown>) {
 const q=String(query.q??'').trim().slice(0,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
 const from=String(query.from??''),to=String(query.to??''),ownerId=String(query.ownerId??'');
 assert([from,to].every(value=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)),'Khoảng ngày không hợp lệ');
 assert(!from||!to||from<=to,'Ngày bắt đầu phải trước ngày kết thúc');
 const matches=(date:string,owner:string,...values:unknown[])=> (!ownerId||owner===ownerId)&&(!from||date.slice(0,10)>=from)&&(!to||date.slice(0,10)<=to)&&(!q||values.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().includes(q));
 return {q,from,to,ownerId,matches};
}
