import type { Page } from "@playwright/test";
import { mockWorkspace, sampleState } from "./metronic-fixture";
import { execute, reservedStock } from "../server/domain";

export async function mockAdminLists(page: Page) {
  let state=sampleState();
  const run=(type:string,payload:any)=>{state=execute(state,{type,payload,version:state.version,idempotencyKey:crypto.randomUUID()},{id:"qa",role:"admin"});};
  run("openingBalance",{amount:"500000",notes:"Quỹ nhập tay kiểm thử"});
  state.inventory=[{productId:state.products[0].id,quantity:30,tracked:true,updatedAt:new Date().toISOString(),source:"Fixture"}];
  run("saveProduct",{name:"Hàng hết kinh doanh",code:"QA-CLEAR",pack:1,cost:"100",price:"120"});
  state.inventory.push({productId:state.products[1].id,quantity:12,tracked:true,updatedAt:new Date().toISOString(),source:"Fixture"});
  state.programs.push({id:"program",name:"Chương trình kiểm thử",mode:"single",lines:[],count:2,remaining:2,price:"0",margin:"0",subsidy:"0",reserved:"0",guaranteeStock:false,status:"active",expiresAt:"2099-01-01",seed:1});
  const base=await mockWorkspace(page,{state});
  const history:Record<string,any[]>={imports:[{id:"import",filename:"khach-hang-kiem-thu.xlsx",kind:"customers",status:"committed",summary:{inserted:20},created_at:new Date().toISOString()}],
    audit:[{id:"audit",actor_name:"Quản trị kiểm thử",action:"update_catalog",reason:"Đối chiếu dữ liệu",object_id:"routes",created_at:new Date().toISOString()}]};
  const requests:any[]=[];const receipts=new Map();
  await page.route("**/api/admin/**",async route=>{
    const request=route.request(),url=new URL(request.url()),resource=url.pathname.split('/')[3];
    if(url.pathname.endsWith('/bulk-actions')) {
      const body=request.postDataJSON();requests.push({resource,...body});
      if(receipts.has(body.idempotencyKey))return route.fulfill({json:receipts.get(body.idempotencyKey)});
      const results=body.items.map((item:any)=>{
        try {
          if(history[resource]){const entry=history[resource].find(row=>row.id===item.id);entry.archived_at=body.action==='trash'?new Date().toISOString():null;}
          else {
            const type=resource==='inventory'?'clearInventory':resource==='funds'?'reverseFundEntry':resource==='programs'?body.action==='trash'?'archiveProgram':'restoreProgramVisibility'
              :resource==='customers'?body.action==='trash'?'deleteCustomer':'restoreCustomer':resource==='products'?body.action==='trash'?'deleteProduct':'restoreProduct':body.action==='trash'?'deleteOrder':'restoreOrder';
            run(type,{id:item.id,productId:item.id,reason:body.reason});
          }
          return {...item,status:'success',message:'Đã xử lý'};
        }catch(error){return {...item,status:'skipped',message:(error as Error).message};}
      });
      const result={results,successCount:results.filter((row:any)=>row.status==='success').length,skippedCount:results.filter((row:any)=>row.status==='skipped').length};
      receipts.set(body.idempotencyKey,result);return route.fulfill({json:result});
    }
    if(url.pathname.endsWith('/entries')&&request.method()==='DELETE'){
      const body=request.postDataJSON();requests.push({resource:'catalogs',...body});run('deleteCatalogEntry',{kind:url.pathname.split('/')[4],...body});return route.fulfill({json:{values:(state.catalogs as any)[url.pathname.split('/')[4]]}});
    }
    if(resource==='catalogs')return route.fulfill({json:{catalogs:state.catalogs,entries:state.catalogEntries??[]}});
    if(resource==='inventory')return route.fulfill({json:{balances:state.inventory.map(row=>({...row,product:state.products.find(p=>p.id===row.productId),reserved:reservedStock(state,row.productId)})),movements:state.inventoryMovements}});
    let rows=resource==='funds'?state.ledger.map(row=>({...row,ownerId:'qa',ownerName:'Nguyễn Minh Anh',reversed:state.ledger.some(entry=>entry.reversalOf===row.id),orderId:state.deliveries.find(delivery=>delivery.id===row.referenceId)?.orderId}))
      :resource==='programs'?state.programs.map(row=>({...row,ownerId:'qa',ownerName:'Nguyễn Minh Anh'}))
      :resource==='orders'?state.orders.map(row=>({...row,ownerId:'qa',ownerName:'Nguyễn Minh Anh',customerName:state.customers[0].name,delivered:'400000'}))
      :history[resource];
    if(!rows)return route.fallback();
    const archive=url.searchParams.get('archive')??'visible';
    rows=rows.filter((row:any)=>archive==='all'||!!(row.archivedAt??row.archived_at)===(archive==='archived'));
    return route.fulfill({json:{items:rows,total:rows.length,page:1,pageSize:25,pages:1}});
  });
  return {...base,requests,getState:()=>state};
}
