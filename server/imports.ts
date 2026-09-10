import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { Product, Customer, Order, OrderLine } from '../shared/types.js';

export type ImportKind = 'cost' | 'quotes' | 'orders';
export interface ImportIssue {code:string; severity:'warning'|'error'; message:string; rowId?:string}
export interface ImportRow {id:string; line:number; raw:string; productId?:string; quantity?:number; price?:string; originalTotal?:string; calculatedTotal?:string; issues:string[]}
export interface ImportPreview {id:string; checksum:string; filename:string; kind:ImportKind; products:Product[]; customers:Customer[]; orders:Order[]; rows:ImportRow[]; issues:ImportIssue[]; summary:{orderCount:number;productCount:number;orderedTotal:string;grossMarginBeforeBenefits:string;availableFund:string}}
const MAX_FILE=10*1024*1024, MAX_EXPANDED=40*1024*1024, MAX_ROWS=10000;
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const lineRevenue=(l:OrderLine)=>new Decimal(l.price).mul(l.quantity).toDecimalPlaces(0);
const lineMargin=(l:OrderLine)=>l.kind==='sale'?lineRevenue(l).sub(new Decimal(l.cost!).mul(l.quantity).toDecimalPlaces(0)):new Decimal(l.cost!).mul(-l.quantity).toDecimalPlaces(0);
function calculateOrder(order:Order){order.total=order.lines.filter(l=>l.kind==='sale').reduce((sum,l)=>sum.add(lineRevenue(l)),new Decimal(0)).toFixed();order.margin=order.lines.some(l=>l.cost===null)?null:order.lines.reduce((sum,l)=>sum.add(lineMargin(l)),new Decimal(0)).toFixed();}
function summarize(p:ImportPreview){p.summary.productCount=p.products.length;p.summary.orderCount=p.orders.length;p.summary.orderedTotal=p.orders.reduce((sum,o)=>sum.add(o.total),new Decimal(0)).toFixed();p.summary.grossMarginBeforeBenefits=p.orders.flatMap(o=>o.lines).filter(l=>l.kind==='sale'&&l.cost!==null&&!p.issues.some(i=>i.rowId===l.id&&i.severity==='error')).reduce((sum,l)=>sum.add(lineMargin(l)),new Decimal(0)).toFixed();}
export const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/true[.\s]*care/g,'care').replace(/\s+/g,' ').trim();
const money=(value:string, contextualThousands=false):string=>{
 let s=value.trim().toLowerCase().replace(/đ|vnd/g,'').replace(/\s/g,'');
 const multiplier=/(tr|triệu)$/.test(s)?1000000:/(k|nghìn)$/.test(s)?1000:1;
 s=s.replace(/(triệu|nghìn|tr|k)$/,'');
 if (multiplier!==1000000&&/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) s=s.replace(/[.,]/g,''); else s=s.replace(',','.');
 let amount=new Decimal(s||0).mul(multiplier);
 if(contextualThousands&&multiplier===1&&amount.lt(1000))amount=amount.mul(1000);
 return amount.toFixed();
};

/** Reject oversized ZIPs before ExcelJS inflates them. Read only the central directory. */
function validateXlsxZip(data:Buffer){
 let eocd=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw new Error('Tệp XLSX không có cấu trúc ZIP hợp lệ.');
 const count=data.readUInt16LE(eocd+10); let at=data.readUInt32LE(eocd+16), total=0;
 if(count>2000||count===65535)throw new Error('Excel có quá nhiều thành phần hoặc dùng ZIP64 không hỗ trợ.');
 for(let n=0;n<count;n++){
  if(at+46>data.length||data.readUInt32LE(at)!==0x02014b50)throw new Error('Cấu trúc Excel không hợp lệ.');
  const size=data.readUInt32LE(at+24), compressed=data.readUInt32LE(at+20);
  total+=size;
  if(total>MAX_EXPANDED||size===0xffffffff||(size>1024*1024&&size/Math.max(1,compressed)>250))throw new Error('Excel nén bất thường hoặc dữ liệu giải nén vượt 40 MB.');
  if(data.readUInt16LE(at+8)&1)throw new Error('Excel mã hóa không được hỗ trợ.');
  at+=46+data.readUInt16LE(at+28)+data.readUInt16LE(at+30)+data.readUInt16LE(at+32);
 }
}
function issue(p:ImportPreview,code:string,message:string,rowId?:string,severity:'warning'|'error'='warning'){
 p.issues.push({code,message,rowId,severity}); const row=p.rows.find(r=>r.id===rowId); if(row)row.issues.push(message);
}
function row(p:ImportPreview,line:number,raw:string):ImportRow{const r={id:`${p.checksum.slice(0,16)}:${line}`,line,raw,issues:[]};p.rows.push(r);return r;}
function plain(value:ExcelJS.CellValue):string|number|null{
 if(value==null)return null;
 if(typeof value==='number'||typeof value==='string')return value;
 if(typeof value==='object'&&'richText'in value)return value.richText.map(x=>x.text).join('');
 if(typeof value==='object'&&'text'in value)return String(value.text);
 // Never execute formulas or silently use cached spreadsheet formula results.
 return null;
}

/** A conservative semantic key: packaging, family, capacity and scent all matter. */
function productCandidates(text:string,products:Product[]):Product[]{
 const n=normalize(text), capacity=n.match(/(\d+(?:[.,]\d+)?)\s*(kg|lit|litre|l\b|ml|gram|gr\b|g\b)/);
 const size=capacity?Number(capacity[1].replace(',','.')):null;
 const family= /\bngx\b|giat xa|nuoc giat|can 3[.,]3kg.*maxx|maxx4 can/.test(n)?'laundry':/\bnxv\b|xa vai|day xa|day xa/.test(n)?'softener':/\bnrc\b|rua chen/.test(n)?'dish':/lau bep|\bnlb\b/.test(n)?'kitchen':/lau kinh|\bnlk\b/.test(n)?'glass':/lau san|\bls\b|\bnls\b/.test(n)?'floor':/tay|toilet|rua nha tam/.test(n)?'bleach':/bot giat/.test(n)?'powder':null;
 if(!family)return [];
 const brands=/maxx/.test(n)?'maxx':family==='laundry'&&/care/.test(n)?'care':null;
 const packaging=/\bcan\b|\bchai ngx\b/.test(n)?'can':/\btui\b/.test(n)?'túi':null;
 const flavor=/nha dam/.test(n)?'nha dam':/tra xanh/.test(n)?'tra xanh':/huong chanh|\bchanh\b/.test(n)?'chanh':null;
 return products.filter(p=>{
  const s=normalize(p.name), g=normalize(p.group);
  const pf=/bot giat/.test(g)?'powder':/giat xa/.test(g)?'laundry':/xa vai/.test(g)?'softener':/rua chen/.test(g)?'dish':/lau san/.test(g)?'floor':/lau bep/.test(s)?'kitchen':/lau kinh/.test(s)?'glass':/tay rua/.test(g)?'bleach':null;
  if(pf!==family)return false;
  if(brands&&(brands==='maxx')!==/maxx/.test(s))return false;
  if(family==='floor'&&!/care/.test(n)&&!/maxx/.test(n)&&!/maxx/.test(s))return false; // User confirmed recent LS = Maxx4.
  if(family==='floor'&&/care/.test(n)&&/maxx/.test(s))return false;
  if(packaging&&p.unit!==packaging)return false;
  if(family==='softener'&&/day/.test(n))return /20\s*(gr|g|ml)/.test(s);
  if(size!==null){const pc=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|lit|l\b|ml|gram|gr\b|g\b)/);if(!pc||Number(pc[1].replace(',','.'))!==size)return false;}
  if(family==='bleach'){
   const zero=/zero|den/.test(n),ss=/\bss\b|sieu sach|tim|xanh/.test(n);
   if(zero&&!/zero/.test(s))return false;if(ss&&!/sieu sach/.test(s))return false;
   if(/mo vit/.test(n)&&!/600ml/.test(s))return false;
  }
  if(family==='dish'&&flavor&&!s.includes(flavor))return false;
  return true;
 });
}

async function parseExcel(p:ImportPreview,data:Buffer,catalog:Product[]){
 validateXlsxZip(data);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(data as any);
 let totalRows=0;
 for(const sheet of workbook.worksheets){
  totalRows+=sheet.rowCount;if(totalRows>MAX_ROWS)throw new Error('Vượt giới hạn 10.000 dòng.');
  for(let i=1;i<=sheet.rowCount;i++){
   const cells=Array.from({length:6},(_,j)=>plain(sheet.getCell(i,j+1).value));
   const formula=Array.from({length:6},(_,j)=>sheet.getCell(i,j+1).value).some(v=>v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v));
   if(p.kind==='cost'){
    if(typeof cells[0]!=='number'||!cells[2])continue;
    const r=row(p,totalRows-sheet.rowCount+i,JSON.stringify({sheet:sheet.name,cells}));
    if(formula||!Number.isSafeInteger(cells[4])||Number(cells[4])<=0||typeof cells[5]!=='number'||cells[5]<0){issue(p,'INVALID_COST','Quy cách hoặc giá gốc không hợp lệ; công thức Excel cần đổi thành giá trị đã kiểm tra.',r.id,'error');continue;}
    const name=String(cells[2]), id=`TC-${String(cells[0]).padStart(3,'0')}`;
    if(p.products.some(x=>x.id===id)){issue(p,'DUPLICATE_SKU','Mã STT sản phẩm bị lặp.',r.id,'error');continue;}
    const isCord=/xa vai 20gr/.test(normalize(name));
    p.products.push({id,code:id,name,group:String(cells[1]||''),brand:/maxx/i.test(name)?'Maxx4':'TrueCare',variant:'',unit:isCord?'dây':String(cells[3]||''),pack:Number(cells[4]),cost:String(cells[5]),price:null,effectiveDate:'2026-09-01'});
    r.productId=id;
    if(isCord)issue(p,'UNIT_ALIAS','Đơn vị nguồn ghi túi; chuẩn hóa thành dây theo ghi chú đã xác nhận, 40 dây/thùng.',r.id);
   } else {
    if(!cells[0]||typeof cells[3]!=='number')continue;
    const r=row(p,totalRows-sheet.rowCount+i,JSON.stringify({sheet:sheet.name,cells}));
    if(formula){issue(p,'FORMULA','Giá chứa công thức cần đối chiếu.',r.id,'error');continue;}
    let description=String(cells[0]);
    if(/nrc/.test(normalize(description))&&cells[4])description+=' '+cells[4];
    let matches=productCandidates(description,catalog);
    // A quotation explicitly covering three scents expands to three cost SKUs.
    const multi=/chanh.*tra xanh.*nha dam/.test(normalize(description));
    if(multi)matches=catalog.filter(x=>/rua chen/.test(normalize(x.group))&&/750g/.test(normalize(x.name)));
    if(matches.length!==1&&!multi){issue(p,'AMBIGUOUS_PRODUCT',`Chưa ghép chắc sản phẩm: ${description} (${matches.length} ứng viên).`,r.id,'error');continue;}
    for(const found of matches){
     if(cells[2]!=null&&Number(cells[2])!==found.pack){issue(p,'PACK_MISMATCH',`Quy cách chào khác giá gốc: ${description}.`,r.id,'error');continue;}
     const existing=p.products.find(x=>x.id===found.id);
     if(existing&&existing.price!==String(cells[3])){issue(p,'DUPLICATE_PRICE','Một SKU có nhiều giá chào cần chọn phiên bản.',r.id,'error');continue;}
     if(!existing)p.products.push({...found,price:String(cells[3])});
     r.productId=found.id;r.price=String(cells[3]);
     if(cells[2]==null)issue(p,'PACK_FROM_COST','Quy cách bảng chào trống; giữ quy cách đã xác định từ bảng gốc.',r.id);
    }
   }
  }
 }
 if(!p.products.length)issue(p,'EMPTY_CATALOG','Không tìm thấy sản phẩm hợp lệ theo cấu trúc bảng giá.',undefined,'error');
}

function quantityFrom(text:string,pack:number):number|null{
 const n=normalize(text);
 const each=n.match(/moi thu\s+(\d+)\s*t\b/);
 if(each){const prefix=n.slice(0,each.index);const colors=prefix.match(/mau\s+\S+/g);return colors&&colors.length>1?Number(each[1])*colors.length*pack:null;}
 const cases=n.match(/(\d+(?:[.,]\d+)?)\s*(?:thung|t\b)/);
 if(cases)return Number(cases[1].replace(',','.'))*pack;
 const units=n.match(/(\d+)\s*(?:chai|can|tui|day|cai)\b/);
 if(units)return Number(units[1]);
 if(/tang chai/.test(n))return 1;
 return null;
}
function priceFrom(text:string):string|null{
 const left=normalize(text.split('=')[0]);
 const explicit=left.match(/gia\s*\*?\s*([\d.,]+\s*[kK]?)/i);
 if(explicit)return money(explicit[1],true);
 const after=left.match(/\*\s*([\d.,]+\s*[kK]?)(?!\s*(?:T\b|thùng))/i);
 if(after&&!/^\s*(?:T\b|thùng|chai|can|túi|dây)/i.test(left.slice((after.index||0)+after[0].length)))return money(after[1],true);
 const before=left.match(/([\d.,]+\s*[kK]?)\s*\*/i);
 if(before)return money(before[1],true);
 return null;
}

function parseOrders(p:ImportPreview,data:Buffer,products:Product[]){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/^\uFEFF/,'');
 const lines=text.split(/\r?\n/);if(lines.length>MAX_ROWS)throw new Error('Vượt giới hạn 10.000 dòng.');
 let date='',order:Order|undefined,needsAddress=false,orderStartLine=0;
 const missingPrices=new Map<string,{line:OrderLine;row:ImportRow}>();
 const finalize=()=>{if(order){calculateOrder(order);if(order.lines.some(l=>missingPrices.has(l.id)))order.margin=null;}};
 for(let i=0;i<lines.length;i++){
  const original=lines[i].trim();if(!original||/^=+$/.test(original))continue;
  const d=original.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(d){finalize();date=`${d[3]}-${d[2]}-${d[1]}`;order=undefined;continue;}
  const heading=original.match(/^(?:Đ|D)?(\d+)\/\s*(.+)$/i);
  if(heading){
   finalize();orderStartLine=i+1;const r=row(p,i+1,original),cid=`customer-pending-${r.id}`;
   if(!p.customers.some(c=>c.id===cid))p.customers.push({id:cid,name:heading[2],contact:'',phone:'',email:'',address:'',street:'',ward:'',district:'',province:'',route:'',visitDays:[],frequency:'',storeType:'',notes:'Nhập lịch sử; chưa xác định ngày mở mới.',openedDate:''});
   order={id:`import-${r.id}`,code:`LS-${date}-${heading[1]}-${i+1}`,date,customerId:cid,notes:original,status:'draft',historical:true,lines:[],total:'0',margin:null,reserved:'0',version:1};p.orders.push(order);needsAddress=true;
   if(!date)issue(p,'MISSING_DATE','Đơn chưa có ngày.',r.id,'error');continue;
  }
  if(!order){issue(p,'UNRECOGNIZED_TEXT',`Dòng ${i+1} chưa thuộc toa nào.`,row(p,i+1,original).id,'error');continue;}
  order.notes+='\n'+original;
  if(needsAddress){const c=p.customers.find(c=>c.id===order!.customerId)!;c.address=original;const stableId=`customer-${hash(normalize(c.name)+'|'+normalize(original)).slice(0,16)}`;if(p.customers.some(x=>x.id===stableId))p.customers=p.customers.filter(x=>x!==c);else c.id=stableId;order.customerId=stableId;needsAddress=false;continue;}
  const total=original.match(/^TC\s*:\s*([\d.,]+\s*(?:[kK]|tr)?)/i);
  if(total){
   const sourceTotal=money(total[1],true),sales=order.lines.filter(l=>l.kind==='sale');
   const otherErrors=p.issues.some(x=>x.severity==='error'&&x.code!=='MISSING_PRICE'&&p.rows.some(r=>r.id===x.rowId&&r.line>=orderStartLine));
   if(sales.length===1&&missingPrices.has(sales[0].id)&&!otherErrors){
    const pending=missingPrices.get(sales[0].id)!;
    pending.line.price=new Decimal(sourceTotal).div(pending.line.quantity).toFixed();pending.row.price=pending.line.price;pending.row.originalTotal=sourceTotal;pending.row.calculatedTotal=sourceTotal;
    p.issues=p.issues.filter(x=>!(x.rowId===pending.row.id&&x.code==='MISSING_PRICE'));pending.row.issues=[];
    issue(p,'DERIVED_PRICE','Toa chỉ một mặt hàng bán: suy đơn giá từ TC / số lượng quy đổi.',pending.row.id);missingPrices.delete(pending.row.id);
   }
   finalize();const r=row(p,i+1,original);r.originalTotal=sourceTotal;r.calculatedTotal=order.total;if(sourceTotal!==order.total)issue(p,'ORDER_TOTAL_MISMATCH',`TC nguồn ${sourceTotal}đ; tính lại ${order.total}đ.`,r.id);continue;
  }
  const running=original.match(/^Lũy tiến\s*:\s*([\d.,]+\s*(?:[kK]|tr)?)/i);
  if(running){finalize();const actual=p.orders.filter(o=>o.date===date).reduce((s,o)=>s.add(o.total),new Decimal(0));const source=money(running[1]);const r=row(p,i+1,original);r.originalTotal=source;r.calculatedTotal=actual.toFixed();if(!actual.eq(source))issue(p,'RUNNING_TOTAL_MISMATCH',`Lũy tiến nguồn ${source}đ; cộng lại ${actual.toFixed()}đ.`,r.id);continue;}
  const r=row(p,i+1,original),n=normalize(original),kind:OrderLine['kind']=/tra trung bay/.test(n)?'display':/tang|khuyen mai/.test(n)?'gift':'sale';
  if(/doi|tra/.test(n)&&kind==='sale'&&!/tra xanh/.test(n)){issue(p,'RETURN_REVIEW','Đổi/trả cần gắn phiếu giao gốc; giữ nguyên để đối chiếu.',r.id,'error');continue;}
  let candidates=productCandidates(original.split('=')[0],products);
  if(!candidates.length&&kind==='display'){
   const capacity=n.match(/(\d+(?:[.,]\d+)?)\s*kg/),packaging=n.match(/\b(can|tui|chai)\b/);
   if(capacity&&packaging)candidates=products.filter(product=>order!.lines.some(l=>l.kind==='sale'&&l.productId===product.id)&&normalize(product.unit)===packaging[1]&&normalize(product.name).includes(capacity[1].replace(',','.')+'kg'));
   if(candidates.length===1)issue(p,'CONTEXT_PRODUCT','Ghép hỗ trợ trưng bày với đúng sản phẩm cùng bao bì/dung lượng đã bán trong toa.',r.id);
  }
  const product=candidates.length===1?candidates[0]:undefined;
  const quantity=quantityFrom(original,product?.pack||0);
  if(!product){issue(p,'AMBIGUOUS_PRODUCT',`Chưa ghép chắc sản phẩm (${candidates.length} ứng viên); giữ dữ liệu gốc.`,r.id,kind==='sale'?'error':'warning');}
  if(quantity===null||quantity<=0){issue(p,'MISSING_QUANTITY','Chưa đủ dữ liệu xác định số lượng.',r.id,'error');continue;}
  const equal=original.match(/(?:=|\bTC\s*:)\s*([\d.,]+\s*[kK]?)/i),originalTotal=equal?money(equal[1],true):null;
  let price=kind==='sale'?priceFrom(original):'0';
  if(price===null&&originalTotal){price=new Decimal(originalTotal).div(quantity).toFixed();issue(p,'DERIVED_PRICE','Suy đơn giá từ thành tiền dòng / số lượng, giữ độ chính xác.',r.id);}
  const needsPrice=price===null;
  if(needsPrice){issue(p,'MISSING_PRICE','Chưa đủ dữ liệu xác định giá bán.',r.id,'error');price='0';}
  if(!product&&kind==='sale')continue;
  const parsedPrice=price!;
  r.productId=product?.id;r.quantity=quantity;r.price=needsPrice?undefined:parsedPrice;r.originalTotal=originalTotal||undefined;r.calculatedTotal=needsPrice?undefined:new Decimal(parsedPrice).mul(quantity).toFixed(0);
  if(originalTotal&&r.calculatedTotal&&!new Decimal(originalTotal).eq(r.calculatedTotal))issue(p,'LINE_TOTAL_MISMATCH',`Thành tiền nguồn ${originalTotal}đ; tính lại ${r.calculatedTotal}đ.`,r.id);
  if(product?.price&&kind==='sale'&&new Decimal(parsedPrice).gt(product.price))issue(p,'HISTORICAL_ABOVE_CEILING','Giữ giá thực bán lịch sử cao hơn bảng chào; trần áp dụng cho chào mới.',r.id);
  if(kind!=='sale')issue(p,'SPONSOR_UNCONFIRMED','Chưa xác nhận nguồn chịu chi phí; tạm chọn nhân viên trên nháp, cần kiểm tra trước giao.',r.id);
  if(!product)issue(p,'MISSING_BENEFIT_COST','Quà ngoài danh mục thiếu giá vốn; không tính giá bằng 0.',r.id);
  const parsedLine:OrderLine={id:r.id,productId:product?.id||'',name:product?.name||original,quantity,price:price!,cost:product?.cost??null,ceiling:product?.price??null,pack:product?.pack||1,unit:product?.unit||'cái',kind,sponsor:'employee',discount:'0',delivered:0,returned:0};
  order.lines.push(parsedLine);if(needsPrice)missingPrices.set(r.id,{line:parsedLine,row:r});
 }
 finalize();
 if(!p.orders.length)issue(p,'NO_ORDERS','Không tìm thấy toa theo mẫu ngày và Đ1/ tên khách.',undefined,'error');
}

export async function importPreview(buffer:Buffer,filename:string,kind:ImportKind,products:Product[]=[]):Promise<ImportPreview>{
 if(!buffer.length||buffer.length>MAX_FILE)throw new Error('Tệp phải có nội dung và không vượt 10 MB.');
 if(!['cost','quotes','orders'].includes(kind))throw new Error('Loại nhập không hợp lệ.');
 if(kind==='orders'&&!/\.txt$/i.test(filename)||kind!=='orders'&&!/\.xlsx$/i.test(filename))throw new Error('Loại tệp không khớp: đơn TXT, bảng giá XLSX.');
 const checksum=hash(buffer),p:ImportPreview={id:checksum,checksum,filename:filename.replace(/^.*[\\/]/,''),kind,products:[],customers:[],orders:[],rows:[],issues:[],summary:{orderCount:0,productCount:0,orderedTotal:'0',grossMarginBeforeBenefits:'0',availableFund:'0'}};
 if(kind==='orders')parseOrders(p,buffer,products);else await parseExcel(p,buffer,products);
 summarize(p);
 return p;
}

export interface ImportResolution {rowId:string;productId?:string;quantity?:number;price?:string;exclude?:boolean}
/** Run only against the preview stored server-side for the authenticated owner. */
export function resolveImport(source:ImportPreview,resolutions:ImportResolution[],catalog:Product[]):ImportPreview{
 if(!Array.isArray(resolutions)||resolutions.length>MAX_ROWS)throw new Error('Danh sách đối chiếu không hợp lệ.');
 const p:ImportPreview=structuredClone(source);
 const headerLine=(order:Order)=>Number(order.id.split(':').at(-1));
 const owningOrder=(r:ImportRow)=>p.orders.filter(o=>headerLine(o)<=r.line).sort((a,b)=>headerLine(b)-headerLine(a))[0];
 for(const resolution of resolutions){
  const r=p.rows.find(x=>x.id===resolution.rowId);if(!r)throw new Error('Dòng đối chiếu không thuộc bản xem trước.');
  if(resolution.exclude){
   if(p.kind==='orders'){
    const order=owningOrder(r);if(!order)throw new Error('Không xác định được đơn chứa dòng cần loại.');
    const begin=headerLine(order),end=Math.min(...p.orders.filter(o=>headerLine(o)>begin).map(headerLine),Infinity);
    const ids=new Set(p.rows.filter(x=>x.line>=begin&&x.line<end).map(x=>x.id));
    p.orders=p.orders.filter(o=>o!==order);
    for(const problem of p.issues)if(problem.rowId&&ids.has(problem.rowId))problem.severity='warning';
    issue(p,'ORDER_EXCLUDED','Đã loại toàn bộ toa chứa dòng này khỏi lô nhập theo lựa chọn; nội dung gốc vẫn được giữ trong bản xem trước.',r.id);
   }else{
    if(r.productId)p.products=p.products.filter(product=>product.id!==r.productId);
    for(const problem of p.issues)if(problem.rowId===r.id)problem.severity='warning';
    issue(p,'ROW_EXCLUDED','Dòng bảng giá đã được loại khỏi lô nhập theo lựa chọn.',r.id);
   }
   continue;
  }
  const product=catalog.find(x=>x.id===resolution.productId);
  if(!product)throw new Error('Cần chọn sản phẩm trong danh mục hiện tại.');
  const quantity=resolution.quantity??r.quantity,price=resolution.price??r.price;
  if(p.kind==='orders'&&(!Number.isFinite(quantity)||!Number.isInteger(quantity)||quantity!<=0))throw new Error('Số lượng đối chiếu phải là số nguyên dương.');
  if(price===undefined||!new Decimal(price).isFinite()||new Decimal(price).lt(0))throw new Error('Đơn giá đối chiếu không hợp lệ.');
  const cleared=new Set(['AMBIGUOUS_PRODUCT','MISSING_QUANTITY','MISSING_PRICE','MISSING_BENEFIT_COST','PACK_MISMATCH','DUPLICATE_PRICE']);
  p.issues=p.issues.filter(i=>i.rowId!==r.id||!cleared.has(i.code));r.issues=p.issues.filter(i=>i.rowId===r.id).map(i=>i.message);
  if(p.kind==='orders'){
   const order=owningOrder(r);if(!order)throw new Error('Không xác định được toa cho dòng đối chiếu.');
   const previous=order.lines.find(l=>l.id===r.id),n=normalize(r.raw);
   const kind=previous?.kind||(/tra trung bay/.test(n)?'display':/tang|khuyen mai/.test(n)?'gift':'sale');
   const value:OrderLine={id:r.id,productId:product.id,name:product.name,quantity:quantity!,price:kind==='sale'?price:'0',cost:product.cost,ceiling:product.price,pack:product.pack,unit:product.unit,kind,sponsor:previous?.sponsor||'employee',discount:'0',delivered:0,returned:0};
   if(previous)order.lines[order.lines.indexOf(previous)]=value;else order.lines.push(value);
   order.notes+=`\nĐối chiếu dòng ${r.line}: ${product.code}; số lượng ${quantity}; giá ${value.price}.`;
   r.productId=product.id;r.quantity=quantity;r.price=value.price;r.calculatedTotal=lineRevenue(value).toFixed();calculateOrder(order);
  }else if(p.kind==='quotes'){
   const updated={...product,price};p.products=p.products.filter(x=>x.id!==updated.id);p.products.push(updated);r.productId=updated.id;r.price=price;
  }else throw new Error('Bảng giá gốc có lỗi cần sửa tệp rồi tải lại để giữ đầy đủ nhóm, quy cách và ngày hiệu lực.');
  issue(p,'MANUALLY_RESOLVED','Đã đối chiếu thủ công; giữ nguyên nội dung nguồn và ghi dữ liệu đã xác nhận.',r.id);
 }
 p.customers=p.customers.filter(c=>p.orders.some(o=>o.customerId===c.id));summarize(p);return p;
}
