import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute, refresh, reservedStock } from "../server/domain.js";
import type { AppState } from "../shared/types.js";
const admin = {id:"qa",role:"admin" as const};
const run=(s:AppState,type:string,payload:unknown)=>execute(s,{type,payload,version:s.version,idempotencyKey:crypto.randomUUID()},admin);
function fixture(){
  let state=emptyState();
  state=run(state,"saveProduct",{name:"Test",cost:"100",price:"200",pack:1});
  state=run(state,"saveCustomer",{name:"Test customer"});
  return state;
}
test("save and confirm is one state version and rejects without leaving a saved draft",()=>{
  const state=fixture();
  const next=run(state,"saveAndConfirmOrder",{order:{customerId:state.customers[0].id,lines:[{productId:state.products[0].id,quantity:1,price:"180"}]}});
  assert.equal(next.version,state.version+1);assert.equal(next.orders[0].status,"confirmed");assert.equal(state.orders.length,0);
  const before=structuredClone(state);
  assert.throws(()=>run(state,"saveAndConfirmOrder",{order:{customerId:state.customers[0].id,lines:[{productId:state.products[0].id,quantity:1,price:"250"}]}}));
  assert.deepEqual(state,before);
});
test("edited draft confirms its new content without a second stale command",()=>{
  let state=fixture();state=run(state,"saveOrder",{customerId:state.customers[0].id,lines:[{productId:state.products[0].id,quantity:1,price:"180"}]});
  const before=state.version;
  state=run(state,"saveAndConfirmOrder",{order:{id:state.orders[0].id,customerId:state.customers[0].id,notes:"Changed",lines:[{productId:state.products[0].id,quantity:2,price:"180"}]}});
  assert.equal(state.version,before+1);assert.equal(state.orders.length,1);assert.equal(state.orders[0].status,"confirmed");assert.equal(state.orders[0].total,"360");
});
test("expired reservations stop reducing fund and stock and expire once on next write",()=>{
  let state=fixture();
  state.programs.push({id:"expired",name:"Past",mode:"bundle",lines:[{...({} as any),productId:state.products[0].id,quantity:2}],count:1,remaining:1,price:"100",margin:"-100",subsidy:"100",reserved:"100",guaranteeStock:true,status:"active",expiresAt:"2020-01-01",seed:1});
  refresh(state);assert.equal(state.summary.reserved,"0");assert.equal(reservedStock(state,state.products[0].id),0);
  state=run(state,"updateSettings",{displayName:"After expiry"});
  assert.equal(state.programs[0].status,"expired");assert.equal(state.programs[0].reserved,"0");assert.equal(state.audit.filter(a=>a.type==="expireProgram").length,1);
  state=run(state,"updateSettings",{displayName:"Again"});assert.equal(state.audit.filter(a=>a.type==="expireProgram").length,1);
});
