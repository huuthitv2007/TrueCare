import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {importPreview} from '../server/imports.js';

// Local-only preview. Never commits customer data or records deliveries.
const root=process.cwd();
const source=async(name:string)=>readFile(resolve(root,name));
const cost=await importPreview(await source('bang_gia_goc_san_pham_thang_9.xlsx'),'bang_gia_goc_san_pham_thang_9.xlsx','cost');
const quotes=await importPreview(await source('bang_gia_chao_hang.xlsx'),'bang_gia_chao_hang.xlsx','quotes',cost.products);
const products=cost.products.map(p=>quotes.products.find(q=>q.id===p.id)||p);
const orders=await importPreview(await source('don_hang.txt'),'don_hang.txt','orders',products);
const preview={generatedAt:new Date().toISOString(),notice:'Bản xem trước cục bộ. Chưa nhập tài khoản, chưa ghi nhận giao hàng.',products,customers:orders.customers,orders:orders.orders,previews:{cost,quotes,orders},sourceIssues:[...cost.issues,...quotes.issues,...orders.issues]};
await mkdir(resolve(root,'.private'),{recursive:true});
await writeFile(resolve(root,'.private/resource-preview.json'),JSON.stringify(preview,null,2),'utf8');
console.log(JSON.stringify({products:products.length,priced:products.filter(p=>p.price!==null).length,...orders.summary,costIssues:cost.issues.length,quoteIssues:quotes.issues.map(i=>({code:i.code,message:i.message})),orderIssues:orders.issues.map(i=>({code:i.code,message:i.message})),output:'.private/resource-preview.json'},null,2));
