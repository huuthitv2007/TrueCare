import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute } from "../server/domain.js";
import type { AppState } from "../shared/types.js";

const run = (state: AppState, type: string, payload: any, role: "admin" | "employee" = "admin") =>
  execute(state, {type,payload,version:state.version,idempotencyKey:crypto.randomUUID()}, {id:role,role});

test("fund reversal retains the original and cannot reverse twice or reverse an opposing entry", () => {
  const original=run(emptyState(),"openingBalance",{amount:"9007199254740993",notes:"Opening"});
  const entry=structuredClone(original.ledger[0]);
  const reversed=run(original,"reverseFundEntry",{id:entry.id,reason:"Correct balance"});
  assert.deepEqual(reversed.ledger[0],entry);
  assert.equal(reversed.ledger[1].amount,"-9007199254740993");
  assert.equal(reversed.ledger[1].reversalOf,entry.id);
  assert.equal(reversed.summary.fund,"0");
  assert.throws(()=>run(reversed,"reverseFundEntry",{id:entry.id,reason:"Different request"}),/đã được bù trừ/);
  assert.throws(()=>run(reversed,"reverseFundEntry",{id:reversed.ledger[1].id,reason:"Undo reversal"}),/chứng từ gốc/);
  assert.throws(()=>run(original,"reverseFundEntry",{id:entry.id,reason:"Employee request"},"employee"),/quản trị/);
  assert.throws(()=>run(original,"reverseFundEntry",{id:entry.id,reason:"a"}),/lý do/);
});

test("negative manual entries reverse accurately while automatic fund entries are protected",()=>{
  let state=run(emptyState(),"adjustFund",{amount:"-150",notes:"Correction"});
  state=run(state,"reverseFundEntry",{id:state.ledger[0].id,reason:"Cancel correction"});
  assert.equal(state.ledger[1].amount,"150");
  state.ledger.push({id:"delivered",type:"delivery",amount:"20",referenceId:"delivery-id",date:"2026-09-12",notes:"Delivery"});
  assert.throws(()=>run(state,"reverseFundEntry",{id:"delivered",reason:"Cannot remove"}),/chứng từ gốc/);
});

test("clear stock records one movement and preserves the submitted command for idempotency",()=>{
  let state=run(emptyState(),"saveProduct",{name:"Stock test",pack:1,cost:"10",price:"20"});
  const productId=state.products[0].id;
  state=run(state,"adjustInventory",{productId,mode:"set",quantity:12,reason:"Opening stock",tracked:false});
  const payload={productId,reason:"Clear obsolete balance"};
  const cleared=run(state,"clearInventory",payload);
  assert.deepEqual(payload,{productId,reason:"Clear obsolete balance"});
  assert.equal(cleared.inventory[0].quantity,0);
  assert.equal(cleared.inventory[0].tracked,false);
  assert.equal(cleared.inventoryMovements.at(-1)!.quantity,-12);
  assert.equal(cleared.inventoryMovements.length,state.inventoryMovements.length+1);
  assert.throws(()=>run(cleared,"clearInventory",payload),/đã bằng 0/);
  assert.throws(()=>run(state,"clearInventory",payload,"employee"),/quản trị/);
});

test("reserved stock blocks clearing and archive/restore never reactivates a program",()=>{
  let state=run(emptyState(),"saveProduct",{name:"Program stock",pack:1,cost:"10",price:"20"});
  const productId=state.products[0].id;
  state=run(state,"adjustInventory",{productId,mode:"set",quantity:10,reason:"Opening"});
  state.programs.push({id:"program",name:"Program",mode:"single",lines:[{productId,quantity:2} as any],count:2,remaining:2,
    price:"40",margin:"0",subsidy:"0",reserved:"0",guaranteeStock:true,status:"active",expiresAt:"2099-01-01",seed:1});
  assert.throws(()=>run(state,"clearInventory",{productId,reason:"Reserved test"}),/đang giữ/);
  const archived=run(state,"archiveProgram",{id:"program",reason:"Cancel program"});
  assert.equal(archived.programs[0].status,"cancelled");assert.ok(archived.programs[0].archivedAt);
  assert.equal(archived.programs[0].reserved,"0");assert.deepEqual(archived.orders,state.orders);
  const restored=run(archived,"restoreProgramVisibility",{id:"program",reason:"Show history"});
  assert.equal(restored.programs[0].status,"cancelled");assert.equal(restored.programs[0].archivedAt,undefined);
  assert.equal(run(restored,"clearInventory",{productId,reason:"Now released"}).inventory[0].quantity,0);
  assert.throws(()=>run(state,"archiveProgram",{id:"program",reason:"No permission"},"employee"),/quản trị/);
});

test("catalog delete removes only the requested entry and preserves live references and identity",()=>{
  let state=run(emptyState(),"saveCatalog",{routes:["Route A","Route B","Route C"]});
  const existing=state.catalogEntries!.find(row=>row.value==="Route B")!;
  state=run(state,"deleteCatalogEntry",{kind:"routes",value:"Route A",reason:"Remove unused"});
  assert.deepEqual(state.catalogs!.routes,["Route B","Route C"]);
  assert.equal(state.catalogEntries!.find(row=>row.value==="Route B")!.id,existing.id);
  state=run(state,"saveCustomer",{name:"Customer",route:"Route B"});
  assert.throws(()=>run(state,"deleteCatalogEntry",{kind:"routes",value:"Route B",reason:"In use"}),/sử dụng/);
  assert.throws(()=>run(state,"deleteCatalogEntry",{kind:"visitDays",value:state.catalogs!.visitDays[0],reason:"Fixed entry"}),/cố định/);
});
