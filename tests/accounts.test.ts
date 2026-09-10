import test from 'node:test';
import assert from 'node:assert/strict';
import {accountUser,isAdmin,normalizeEmail,normalizeUsername,requireAdmin,validateEmployeePassword} from '../server/accounts.js';
import {DomainError} from '../server/domain.js';

const row={user_id:'user-1',email:'demo@huuthi.com',username:'demo',display_name:'Nhân viên Demo',role:'employee' as const,active:true,created_at:'2026-09-10T00:00:00Z',updated_at:'2026-09-10T00:00:00Z'};
test('chuẩn hóa username/email và role được lấy từ nguồn server',()=>{
 assert.equal(normalizeUsername(' Demo_01 '),'demo_01');assert.equal(normalizeEmail(' ADMIN@HUUTHI.COM '),'admin@huuthi.com');
 assert.deepEqual(accountUser(row),{id:'user-1',email:'demo@huuthi.com',username:'demo',displayName:'Nhân viên Demo',role:'employee',active:true});
 assert.equal(isAdmin(accountUser({...row,role:'admin'})),true);assert.equal(isAdmin(accountUser(row)),false);
});
test('chặn username, mật khẩu nhân viên yếu và role employee vào API admin',()=>{
 assert.throws(()=>normalizeUsername('a!'),DomainError);assert.throws(()=>validateEmployeePassword('short'),DomainError);assert.throws(()=>requireAdmin(accountUser(row)),DomainError);
});
