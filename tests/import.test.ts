import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type {Product} from '../shared/types.js';
import {importPreview} from '../server/imports.js';
const product=(values:Partial<Product>):Product=>({id:'p1',code:'p1',name:'Nước giặt xả 3.6kg',group:'NƯỚC GIẶT XẢ TRUECARE',brand:'TrueCare',variant:'',unit:'can',pack:4,cost:'100000',price:'150000',effectiveDate:'2026-09-01',...values});
const preview=(body:string,catalog=[product({})])=>importPreview(Buffer.from(body),'orders.txt','orders',catalog);

test('case quantity does not double count unit multiplier; wrong arithmetic remains inspectable',async()=>{
 const p=await preview('08/09/2026\nĐ1/ Cửa hàng mẫu A\nĐịa chỉ mẫu\n1T NGX can 3.6KG giá 139k * 4 = 600k\nTC: 600k');
 assert.equal(p.orders[0].lines[0].quantity,4);assert.equal(p.orders[0].lines[0].price,'139000');assert.equal(p.summary.orderedTotal,'556000');
 assert.ok(p.issues.some(i=>i.code==='LINE_TOTAL_MISMATCH'));assert.equal(p.orders[0].status,'draft');assert.equal(p.orders[0].lines[0].delivered,0);assert.equal(p.summary.availableFund,'0');
});
test('derive a one-item invoice price from total without rounding beforehand',async()=>{
 const p=await preview('08/09/2026\nĐ1/ Cửa hàng mẫu B\nĐịa chỉ mẫu\n1T NRC 400gram\nTC: 368.000', [product({name:'Nước rửa chén hương chanh 400g',group:'RỬA CHÉN',unit:'chai',pack:24,cost:'11871',price:'12000'})]);
 assert.equal(p.summary.orderedTotal,'368000');assert.equal(p.orders[0].lines[0].quantity,24);assert.equal(p.summary.grossMarginBeforeBenefits,'83096');assert.ok(p.issues.some(i=>i.code==='DERIVED_PRICE'));assert.equal(p.issues.filter(i=>i.severity==='error').length,0);
});
test('same customer and date can have two actual orders, replay has stable checksum and row IDs',async()=>{
 const body='08/09/2026\nĐ1/ Khách mẫu\nĐịa chỉ mẫu\n1T NGX 3.6KG * 139k = 556k\nĐ2/ Khách mẫu\nĐịa chỉ mẫu\n1T NGX 3.6KG * 139k = 556k';
 const first=await preview(body),again=await preview(body);
 assert.equal(first.orders.length,2);assert.equal(first.customers.length,1);assert.notEqual(first.orders[0].id,first.orders[1].id);assert.equal(first.checksum,again.checksum);assert.equal(first.orders[0].id,again.orders[0].id);
});
test('same customer name at distinct addresses is not silently merged',async()=>{
 const p=await preview('08/09/2026\nĐ1/ Khách mẫu\nĐịa chỉ A\n1T NGX 3.6KG * 139k\nĐ2/ Khách mẫu\nĐịa chỉ B\n1T NGX 3.6KG * 139k');
 assert.equal(p.customers.length,2);assert.notEqual(p.orders[0].customerId,p.orders[1].customerId);
});
test('ambiguous scents block matching; a missing second product never makes TC single-line evidence',async()=>{
 const catalog=[product({id:'d1',name:'Nước rửa chén chanh 750g',group:'RỬA CHÉN',unit:'chai',pack:24}),product({id:'d2',name:'Nước rửa chén trà xanh 750g',group:'RỬA CHÉN',unit:'chai',pack:24}),product({})];
 const p=await preview('08/09/2026\nĐ1/ Khách mẫu\nĐịa chỉ mẫu\n1T NGX 3.6KG\n1T NRC 750g * 25k\nTC: 900k',catalog);
 assert.ok(p.issues.some(i=>i.code==='AMBIGUOUS_PRODUCT'&&i.severity==='error'));assert.ok(p.issues.some(i=>i.code==='MISSING_PRICE'));assert.ok(!p.issues.some(i=>i.code==='DERIVED_PRICE'));
});
test('unknown gift cost stays null and does not enter sales',async()=>{
 const p=await preview('08/09/2026\nĐ1/ Khách mẫu\nĐịa chỉ mẫu\n1T NGX 3.6KG * 139k\n*Tặng 1 cái giá đỡ');
 assert.equal(p.summary.orderedTotal,'556000');assert.equal(p.orders[0].lines[1].cost,null);assert.equal(p.orders[0].margin,null);assert.ok(p.issues.some(i=>i.code==='MISSING_BENEFIT_COST'));
});
test('read merged groups only within merge range and refuse formula cost',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Cost');
 sheet.addRow(['STT','Nhóm','Tên','Đơn vị','QC','Giá']);sheet.addRow([1,'NƯỚC GIẶT XẢ TRUECARE','Nước giặt xả 3.6kg','can',4,100000]);sheet.addRow([2,null,'Nước giặt xả 2.4kg','can',6,90000]);sheet.mergeCells('B2:B3');sheet.addRow([3,null,'Nước giặt xả 4.8kg','can',3,{formula:'1+1',result:2}]);
 const p=await importPreview(Buffer.from(await book.xlsx.writeBuffer()),'cost.xlsx','cost');
 assert.equal(p.products.length,2);assert.equal(p.products[1].group,'NƯỚC GIẶT XẢ TRUECARE');assert.ok(p.issues.some(i=>i.code==='INVALID_COST'));
});
test('refuse invalid, oversized and excessive-expanded ZIP uploads before parsing',async()=>{
 await assert.rejects(()=>importPreview(Buffer.from('not zip'),'cost.xlsx','cost'),/ZIP/);
 await assert.rejects(()=>importPreview(Buffer.alloc(10*1024*1024+1),'cost.xlsx','cost'),/10 MB/);
 const book=new ExcelJS.Workbook();book.addWorksheet('s').addRow(['text']);const data=Buffer.from(await book.xlsx.writeBuffer());
 const central=data.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));data.writeUInt32LE(50*1024*1024,central+24);
 await assert.rejects(()=>importPreview(data,'cost.xlsx','cost'),/40 MB/);
});
