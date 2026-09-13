import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { emptyState } from "../server/domain.js";

test("workspace hardening SQL isolates admin views, consumes recovery once, guards cross-employee references and expired stock", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid,name text,bucket_id text);
      create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';`);
    for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const admin = crypto.randomUUID(), employee = crypto.randomUUID();
    for (const [id, role] of [[admin, "admin"], [employee, "employee"]]) {
      await db.query("insert into auth.users(id) values($1)", [id]);
      await db.query("insert into employee_accounts(user_id,email,username,display_name,role) values($1::uuid,$2,$1::text,$1::text,$3)", [id, `${id}@test.local`, role]);
    }
    const state = emptyState();
    const schedule = { id: "schedule", date: "2026-09-12", startTime: "08:00", endTime: "09:00", route: "A", routeId: "route-a", customerIds: ["customer"], completedCustomerIds: ["customer"], status: "completed", notes: "", createdAt: "2026-09-12", updatedAt: "2026-09-12" };
    const other = { ...state, routeSchedules: [schedule], attendanceRequests: [{ id: "request", date: "2026-09-12", status: "pending" }], visits: [{ id: "visit", customerId: "customer", scheduleId: "schedule", date: "2026-09-12" }] };
    await db.query("insert into employee_states(owner_id,state,version) values($1,$2,0),($3,$4,0)", [admin, state, employee, other]);
    const directory = { products: [], customers: [{ id: "customer", name: "Khách" }, { id: "target", name: "Đích" }], catalogs: { routes: ["A"] }, catalogEntries: [{ id: "route-a", kind: "routes", value: "A", active: true, position: 0 }] };
    await db.query("update shared_directory set data=$1 where id=true", [directory]);
    await db.exec("set role service_role");
    assert.equal((await db.query("select * from admin_route_schedule_list where owner_id=$1", [employee])).rows.length, 1);
    assert.equal((await db.query("select * from admin_attendance_request_list where status='pending'")).rows.length, 1);
    const legacy = { ...schedule, id: "legacy", routeId: undefined };
    await db.query("update employee_states set state=$1 where owner_id=$2", [{ ...other, routeSchedules: [legacy] }, employee]);
    const projected = (await db.query<{ data: typeof schedule & { needsReview: boolean }; route_id: string }>("select data,route_id from admin_route_schedule_list")).rows[0];
    assert.equal(projected.route_id, "route-a");
    assert.equal(projected.data.routeId, "route-a");
    assert.equal(projected.data.needsReview, true);
    assert.equal(projected.data.route, "A");
    await db.query("update employee_states set state=$1 where owner_id=$2", [other, employee]);
    await db.query("insert into app_password_recovery_proofs(token_hash,user_id,expires_at) values('valid',$1,now()+interval '1 hour'),('expired',$1,now()-interval '1 second'),('disabled',$1,now()+interval '1 hour')", [employee]);
    const consume = (hash: string, user = employee) => db.query<{ ok: boolean }>("select consume_password_recovery_proof($1,$2) as ok", [hash, user]);
    assert.equal((await consume("valid", admin)).rows[0].ok, false);
    const outcomes = await Promise.all([consume("valid"), consume("valid")]);
    assert.equal(outcomes.filter(result => result.rows[0].ok).length, 1);
    assert.equal((await consume("expired")).rows[0].ok, false);
    await db.query("update employee_accounts set active=false where user_id=$1", [employee]);
    assert.equal((await consume("disabled")).rows[0].ok, false);
    await db.query("update employee_accounts set active=true where user_id=$1", [employee]);

    await assert.rejects(db.query("update shared_directory set data=$1 where id=true", [{ ...directory, customers: [] }]), /CUSTOMER_REFERENCED/);
    await assert.rejects(db.query("update shared_directory set data=$1 where id=true", [{ ...directory, catalogs: { routes: [] }, catalogEntries: [] }]), /ROUTE_REFERENCED/);
    await assert.rejects(db.query("update shared_directory set data=$1 where id=true", [{ ...directory, catalogEntries: [] }]), /ROUTE_REFERENCED/);
    // Renaming retains the stable catalog ID and the historical schedule label.
    await db.query("update shared_directory set data=$1 where id=true", [{ ...directory, catalogs: { routes: ["Renamed"] }, catalogEntries: [{ ...directory.catalogEntries[0], value: "Renamed" }] }]);
    assert.equal((await db.query<{ data: typeof schedule }>("select data from admin_route_schedule_list")).rows[0].data.route, "A");
    const remapped = (await db.query<{ value: typeof other }>("select replace_customer_reference($1,'customer','target') as value", [other])).rows[0].value;
    assert.deepEqual(remapped.routeSchedules[0].customerIds, ["target"]);
    assert.deepEqual(remapped.routeSchedules[0].completedCustomerIds, ["target"]);
    assert.equal(remapped.visits[0].customerId, "target");
    assert.equal(remapped.visits[0].scheduleId, "schedule");
    assert.equal((await db.query<{ used: boolean }>("select workspace_references_customer($1,'customer') as used", [remapped])).rows[0].used, true);

    const shared = (await db.query<{ version: number }>("select version from shared_directory")).rows[0].version;
    const inv = (await db.query<{ version: number }>("select version from company_inventory_meta")).rows[0].version;
    const program = { status: "active", guaranteeStock: true, remaining: 1, expiresAt: "2000-01-01", lines: [{ productId: "stock", quantity: 2 }] };
    await db.query("update employee_states set state=$1 where owner_id=$2", [{ ...other, programs: [program] }, employee]);
    const clearArgs = [admin, 0, crypto.randomUUID(), "expired-clear", { ...state, version: 1 }, shared, null, inv, [], [], admin, "Clear expired stock", "stock"];
    const cleared = await db.query<{ result: { ok: boolean } }>("select commit_inventory_clear($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result", clearArgs);
    assert.equal(cleared.rows[0].result.ok, true);
    await db.query("update employee_states set state=$1 where owner_id=$2", [{ ...other, programs: [{ ...program, expiresAt: "2999-01-01" }] }, employee]);
    assert.equal((await db.query<{ result: { duplicate: boolean } }>("select commit_inventory_clear($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result", clearArgs)).rows[0].result.duplicate, true);
    await assert.rejects(db.query("select commit_inventory_clear($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [admin, 1, crypto.randomUUID(), "active-clear", { ...state, version: 2 }, shared, null, inv + 1, [], [], admin, "Clear active stock", "stock"]), /INVENTORY_RESERVED_CONFLICT/);

    // Exercise the real merge RPC, including source identity in historical schedule arrays.
    await db.query("select sync_normalized_directory(data,$1,'Prepare merge') from shared_directory where id=true", [admin]);
    const mergeKey = crypto.randomUUID();
    await assert.rejects(db.query("select admin_merge_customer('customer','target',$1,'Merge test',$2)", [employee, mergeKey]), /FORBIDDEN/);
    await db.query("select admin_merge_customer('customer','target',$1,'Merge test',$2)", [admin, mergeKey]);
    const merged = (await db.query<{ state: typeof other }>("select state from employee_states where owner_id=$1", [employee])).rows[0].state;
    assert.deepEqual(merged.routeSchedules[0].customerIds, ["target"]);
    assert.equal(merged.visits[0].customerId, "target");
    assert.equal((await db.query<{ result: { duplicate: boolean } }>("select admin_merge_customer('customer','target',$1,'Merge test',$2) as result", [admin, mergeKey])).rows[0].result.duplicate, true);

    // Two different employees reserve the same shared stock. Even though their
    // workspace versions differ independently, the shared lock prevents oversell.
    await db.query("update employee_states set state=$1,version=0 where owner_id in ($2,$3)", [state, admin, employee]);
    await db.query("insert into company_inventory(product_id,quantity,tracked) values('stock',10,true)");
    const sharedNow = (await db.query<{ version: number }>("select version from shared_directory")).rows[0].version;
    const invNow = (await db.query<{ version: number }>("select version from company_inventory_meta")).rows[0].version;
    const orderState = (quantity: number, version: number) => ({ ...state, version, orders: [{ id: "reserved-order", status: "confirmed", lines: [{ productId: "stock", quantity, delivered: 0 }] }] });
    const commit = (owner: string, expected: number, proposed: unknown, inventory: unknown = null) => db.query("select commit_workspace_v2($1,$2,$3,$4,$5,$6,null,$7,$8,null,$1,'Global stock test')", [owner, expected, crypto.randomUUID(), "global-stock", proposed, sharedNow, invNow, inventory]);
    const concurrent = await Promise.allSettled([commit(admin, 0, orderState(6, 1)), commit(employee, 0, orderState(6, 1))]);
    assert.equal(concurrent.filter(value => value.status === "fulfilled").length, 1);
    assert.match(String((concurrent.find(value => value.status === "rejected") as PromiseRejectedResult).reason), /INVENTORY_RESERVED_CONFLICT/);
    assert.equal((await db.query<{ sum: string }>("select sum(r.quantity) from employee_states e cross join lateral workspace_stock_reservations(e.state) r where r.product_id='stock'")).rows[0].sum, "6");
    // Preserve a preexisting shortage without blocking unrelated attendance, but
    // refuse both increased reservations and reduced physical stock.
    await db.query("update employee_states set state=$1,version=0 where owner_id in ($2,$3)", [orderState(7, 0), admin, employee]);
    await commit(admin, 0, { ...orderState(7, 1), attendance: [{ date: "2026-09-13", status: "worked" }] });
    await assert.rejects(commit(admin, 1, orderState(8, 2)), /INVENTORY_RESERVED_CONFLICT/);
    await assert.rejects(commit(admin, 1, orderState(7, 2), [{ productId: "stock", quantity: 9, tracked: true }]), /INVENTORY_RESERVED_CONFLICT/);
    await commit(admin, 1, orderState(6, 2));
    assert.equal((await db.query<{ folded: string }>("select care_search_text('Đường Tuyến Ánh') as folded")).rows[0].folded, "duong tuyen anh");

    await db.exec("reset role; set role authenticated");
    for (const name of ["admin_route_schedule_list", "admin_attendance_request_list", "app_password_recovery_proofs"]) await assert.rejects(db.query(`select * from ${name}`), /permission denied/);
    await assert.rejects(consume("disabled"), /permission denied/);
  } finally { await db.close(); }
});
