import { useState } from 'react';
import { FileSpreadsheet, Upload, Check, AlertTriangle } from 'lucide-react';
import { useWorkspace, request } from '../api';
import { Button, Field, Heading, Card, Notice, Stat, money, Badge, Empty } from '../ui';
import type { ImportPreview, ImportKind } from '../../server/imports';

export function Imports(){
 const {command,notify,workspaceRequest,adminTarget}=useWorkspace();const [kind,setKind]=useState<ImportKind>('cost');const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState<(ImportPreview & {previewId:string})|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [ack,setAck]=useState(false);const [committed,setCommitted]=useState(false);
 async function load(local=false){setBusy(true);setError('');setPreview(null);setAck(false);setCommitted(false);try{
   let result:ImportPreview & {previewId:string};
   if(local)result=await request('/api/imports/local-preview',{kind});
   else{if(!file)throw new Error('Hãy chọn tệp cần đối chiếu.');if(file.size>10*1024*1024)throw new Error('Tệp vượt giới hạn 10 MB.');const buffer=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<buffer.length;i+=16384)text+=String.fromCharCode(...buffer.subarray(i,i+16384));result=await workspaceRequest('/api/imports/preview',{kind,filename:file.name,base64:btoa(text)})}
   setPreview(result);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function commit(){if(!preview)return;setBusy(true);setError('');try{await command('commitImport',{previewId:preview.previewId});setCommitted(true);notify('Đã nhập dữ liệu đã đối chiếu. Chưa ghi nhận giao hàng.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const blocking=preview?.issues.some(i=>i.severity==='error');
 return <><Heading title="Nhập & đối chiếu dữ liệu" description="Xem số gốc, số tính lại và các dòng cần kiểm tra trước khi lưu."/>
 <Card title="Chọn nguồn dữ liệu" subtitle={adminTarget?`Đang chuẩn bị nhập cho ${adminTarget.displayName}. Tệp gốc được giữ nguyên.`:'Nhập lần lượt giá gốc → giá chào → đơn hàng. Tệp gốc được giữ nguyên.'}><div className="form-grid"><Field label="Loại dữ liệu"><select value={kind} onChange={e=>{setKind(e.target.value as ImportKind);setPreview(null)}}><option value="cost">Bảng giá gốc · Excel</option><option value="quotes">Bảng giá chào hàng · Excel</option><option value="orders">Đơn hàng · TXT</option></select></Field><Field label="Tệp cần nhập" hint="Tối đa 10 MB, 10.000 dòng. Chỉ XLSX hoặc TXT."><input type="file" accept={kind==='orders'?'.txt':'.xlsx'} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/></Field></div><div className="form-actions"><Button variant="primary" busy={busy} onClick={()=>load()} disabled={!file}><Upload size={17}/>Đọc và đối chiếu tệp</Button>{!adminTarget&&<Button busy={busy} onClick={()=>load(true)}><FileSpreadsheet size={17}/>Đọc file trong thư mục TrueCare</Button>}</div></Card>
 {error&&<Notice type="error">{error}</Notice>}
 {!preview&&!busy&&<Empty title="Chưa chọn dữ liệu để đối chiếu" description="Mỗi lần nhập có dấu vết nguồn và kiểm tra trùng tệp. Đơn nhập lịch sử không tự làm tăng quỹ khả dụng."/>}
 {preview&&<><div className="stats-grid"><Stat label="Sản phẩm đối chiếu" value={String(preview.summary.productCount)}/><Stat label="Số toa" value={String(preview.summary.orderCount)}/><Stat label="Tiền hàng tính lại" value={money(preview.summary.orderedTotal)}/><Stat label="Quỹ khả dụng từ lần nhập" value={money(preview.summary.availableFund)} detail="Chưa xác nhận hàng đã giao"/></div>
 <Card title={preview.filename} subtitle={`Dấu nguồn: ${preview.checksum.slice(0,16)} · ${preview.rows.length} dòng`}>
 {preview.kind==='orders'&&<Notice>Quỹ hàng bán dự kiến trước quà/chi phí: <strong>{money(preview.summary.grossMarginBeforeBenefits)}</strong>. Đây chưa phải quỹ thực giao hoặc quỹ sau khuyến mãi.</Notice>}
 {preview.issues.length>0&&<div className="import-issues"><h3><AlertTriangle size={18}/> Nội dung cần đối chiếu ({preview.issues.length})</h3><ul>{preview.issues.map((i,n)=><li key={n}><Badge tone={i.severity==='error'?'red':'amber'}>{i.severity==='error'?'Cần sửa':'Lưu ý'}</Badge> {i.message}</li>)}</ul></div>}
 <div className="table-wrap"><table><thead><tr><th>Dòng</th><th>Nội dung gốc</th><th>Sản phẩm / Số lượng</th><th className="numeric">Tiền gốc</th><th className="numeric">Tính lại</th><th>Đối chiếu</th></tr></thead><tbody>{preview.rows.map(r=><tr key={r.id}><td>{r.line}</td><td className="raw-source">{r.raw}</td><td>{preview.products.find(p=>p.id===r.productId)?.name||r.productId||'—'}{r.quantity!==undefined&&<small className="block">Số lượng: {r.quantity}</small>}</td><td className="numeric">{r.originalTotal===undefined?'—':money(r.originalTotal)}</td><td className="numeric">{r.calculatedTotal===undefined?'—':money(r.calculatedTotal)}</td><td>{r.issues.length?r.issues.join(' · '):<Badge tone="green">Đã đối chiếu</Badge>}</td></tr>)}</tbody></table></div>
 {blocking?<Notice type="error">Có dòng chưa đủ căn cứ. Hãy bổ sung hoặc sửa tệp nguồn rồi đối chiếu lại; ứng dụng chưa cho nhập lô này.</Notice>:<label className="check-label"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Tôi đã xem các lưu ý và đồng ý lưu dữ liệu đã đối chiếu.</label>}
 <div className="form-actions"><Button variant="primary" busy={busy} disabled={blocking||!ack||committed} onClick={commit}><Check size={17}/>{committed?'Đã nhập dữ liệu':'Lưu dữ liệu đã đối chiếu'}</Button><Button onClick={()=>setPreview(null)}>Đóng bản xem trước</Button></div>
 </Card></>}
 </>;
}
