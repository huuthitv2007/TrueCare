import test from 'node:test';
import assert from 'node:assert/strict';
import {readListFilter} from '../server/list-filter.js';

test('admin filters combine inclusive dates, owner and Vietnamese search',()=>{
 const filter=readListFilter({q:'đặng',from:'2026-09-01',to:'2026-09-09',ownerId:'a'});
 assert.equal(filter.matches('2026-09-01T00:00:00','a','Đặng Thị Mai'),true);
 assert.equal(filter.matches('2026-09-09','a','Dang Thi Mai'),true);
 assert.equal(filter.matches('2026-09-10','a','Đặng'),false);
 assert.equal(filter.matches('2026-09-05','b','Đặng'),false);
 assert.equal(filter.matches('2026-09-05','a','Loan'),false);
});
test('admin date filters reject impossible or reversed calendar dates',()=>{
 for(const from of ['2026-02-30','2026-13-01','2026-2-01','2026-09-01<script>'])
  assert.throws(()=>readListFilter({from}));
 assert.throws(()=>readListFilter({from:'2026-09-09',to:'2026-09-01'}));
 assert.doesNotThrow(()=>readListFilter({from:'2024-02-29'}));
});
