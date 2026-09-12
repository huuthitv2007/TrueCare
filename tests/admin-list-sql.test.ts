import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { emptyState, execute } from "../server/domain.js";

test("Postgres migrations preserve immutable history, shared visibility and transaction guards", async () => {
  const db = await PGlite.create();
  try {
    // Isolated PostgreSQL runtime with the Supabase-owned schemas stubbed only
    // for migration bootstrap. No connection to production or customer data.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid,name text,bucket_id text);
      create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';`);
    for (const file of readdirSync("supabase/migrations").filter(file=>file.endsWith(".sql")).sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
    const actor=crypto.randomUUID(), second=crypto.randomUUID(), employee=crypto.randomUUID(), auditId=crypto.randomUUID(), importId=crypto.randomUUID();
    for (const [id,role] of [[actor,"admin"],[second,"admin"],[employee,"employee"]]) {
      await db.query("insert into auth.users(id) values($1)",[id]);
      await db.query("insert into employee_accounts(user_id,email,username,display_name,role) values($1::uuid,$2,$1::text,$1::text,$3)",[id,`${id}@test.local`,role]);
    }
    await db.query("insert into admin_audit_logs(id,actor_id,action,reason) values($1,$2,'test','Original immutable event')",[auditId,actor]);
    await db.query("insert into admin_import_jobs(id,actor_id,filename,kind,status) values($1,$2,'test.xlsx','customers','committed')",[importId,actor]);
    await db.exec("set role service_role;");
    const archive=(resource:string,id:string,value:boolean,who=actor)=>db.query("select set_admin_list_archive($1,$2,$3,$4,$5,$6)",[resource,id,value,who,"Archive test",crypto.randomUUID()]);
    const original=(await db.query("select * from admin_audit_logs where id=$1",[auditId])).rows[0];
    await assert.rejects(archive("audit",auditId,true,employee),/FORBIDDEN/);
    await archive("audit",auditId,true);
    assert.equal((await db.query("select * from admin_audit_list where id=$1 and archived_at is null",[auditId])).rows.length,0);
    assert.equal((await db.query("select * from admin_audit_list where id=$1 and archived_at is not null",[auditId])).rows.length,1);
    await assert.rejects(archive("audit",auditId,true),/ALREADY_PROCESSED/);
    await archive("audit",auditId,false,second);
    assert.equal((await db.query("select * from admin_audit_list where id=$1 and archived_at is null",[auditId])).rows.length,1);
    assert.deepEqual((await db.query("select * from admin_audit_logs where id=$1",[auditId])).rows[0],original);
    await assert.rejects(db.query("delete from admin_audit_logs where id=$1",[auditId]),/APPEND_ONLY/);
    await assert.rejects(db.query("update admin_audit_logs set reason='Changed' where id=$1",[auditId]),/APPEND_ONLY/);
    await archive("imports",importId,true);
    assert.equal((await db.query("select * from admin_import_list where archived_at is null")).rows.length,0);
    assert.equal((await db.query("select * from admin_import_jobs where id=$1",[importId])).rows.length,1);
    await db.exec("reset role;");
    // Failure to write audit must roll back visibility in the same transaction.
    await db.exec("create function fail_archive_audit() returns trigger language plpgsql as $$begin raise exception 'AUDIT_FAILURE'; end$$; create trigger fail_archive before insert on admin_audit_logs for each row execute function fail_archive_audit();");
    await assert.rejects(archive("imports",importId,false),/AUDIT_FAILURE/);
    assert.equal((await db.query("select * from admin_import_list where archived_at is not null")).rows.length,1);
    await db.exec("drop trigger fail_archive on admin_audit_logs;");
    await db.exec("set role authenticated;");
    await assert.rejects(db.query("select * from admin_list_archives"),/permission denied/);
    await assert.rejects(archive("imports",importId,false),/permission denied/);
    await db.exec("reset role;");

    let state=emptyState();
    state=execute(state,{type:"openingBalance",payload:{amount:"100",notes:"Opening"},idempotencyKey:crypto.randomUUID()});
    await db.query("insert into employee_states(owner_id,state,version) values($1,$2,$3)",[actor,state,state.version]);
    await db.query("insert into employee_states(owner_id,state,version) values($1,$2,0)",[employee,{...emptyState(),orders:[{id:"reserved",status:"confirmed",lines:[{productId:"stock",quantity:1,delivered:0}]}]}]);
    const shared=(await db.query<{version:number}>("select version from shared_directory")).rows[0].version;
    const inv=(await db.query<{version:number}>("select version from company_inventory_meta")).rows[0].version;
    const clearArgs=[actor,state.version,crypto.randomUUID(),"clear-fingerprint",{...state,version:state.version+1},shared,null,inv,[],[],actor,"Clear test","stock"];
    await assert.rejects(db.query("select commit_inventory_clear($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",clearArgs),/INVENTORY_RESERVED_CONFLICT/);
    assert.equal((await db.query("select * from command_receipts where command_key=$1",[clearArgs[2]])).rows.length,0);
    // Two callers computed from the same version: exactly one financial update commits.
    const next=execute(state,{type:"reverseFundEntry",payload:{id:state.ledger[0].id,reason:"Reverse test"},version:state.version,idempotencyKey:crypto.randomUUID()},{id:actor,role:"admin"});
    const commit=(key:string)=>db.query("select commit_workspace_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[actor,state.version,key,key,next,shared,null,inv,null,null,actor,"Reverse test"]);
    const outcomes=await Promise.allSettled([commit(crypto.randomUUID()),commit(crypto.randomUUID())]);
    assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1);
    assert.match(String((outcomes.find(result=>result.status==="rejected") as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
    const saved=(await db.query<{state:typeof state}>("select state from employee_states where owner_id=$1",[actor])).rows[0].state;
    assert.equal(saved.ledger.filter(row=>row.reversalOf===state.ledger[0].id).length,1);
  } finally { await db.close(); }
});
