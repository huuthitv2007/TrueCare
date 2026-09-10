import { useEffect, useRef, type ReactNode } from 'react';
import { X, Search, Inbox, ArrowUpRight, LoaderCircle } from 'lucide-react';

export const money = (n: unknown) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' ₫';
export const number = (n: unknown) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(n || 0));
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
export const day = (d: string) => d ? new Date(d.slice(0,10) + 'T12:00:00').toLocaleDateString('vi-VN') : '—';
export const normalized = (s: unknown) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export const matches = (query: string, ...values: unknown[]) => normalized(values.join(' ')).includes(normalized(query));
export const download = (name: string, content: string, type = 'text/plain;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob(['\ufeff' + content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
};
export function Button({children, variant = '', busy, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; busy?: boolean }) {
  return <button {...props} className={`btn ${variant} ${props.className || ''}`} disabled={busy || props.disabled}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function Field({label,children,hint}: {label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>}
export function Heading({eyebrow,title,description,actions}: {eyebrow?:string;title:string;description?:string;actions?:ReactNode}) {return <header className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="heading-actions">{actions}</div></header>}
export function Card({title,subtitle,actions,children,className=''}:{title?:string;subtitle?:string;actions?:ReactNode;children:ReactNode;className?:string}) {return <section className={`card ${className}`}>{(title||actions) && <div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions}</div>}{children}</section>}
export function Stat({label,value,detail,icon,accent=''}: {label:string;value:string;detail?:string;icon?:ReactNode;accent?:string}) {return <div className={`stat ${accent}`}><div className="stat-label">{label}{icon||<ArrowUpRight size={17}/>}</div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>}
export function SearchBox({value,onChange,placeholder='Tìm kiếm…'}:{value:string;onChange:(v:string)=>void;placeholder?:string}) {return <div className="search-box"><Search size={18}/><input aria-label={placeholder} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value && <button aria-label="Xóa tìm kiếm" onClick={()=>onChange('')}><X size={15}/></button>}</div>}
export function Empty({title='Chưa có dữ liệu',description='Dữ liệu của bạn sẽ xuất hiện tại đây.',action}:{title?:string;description?:string;action?:ReactNode}) {return <div className="empty"><div className="empty-icon"><Inbox size={25}/></div><h3>{title}</h3><p>{description}</p>{action}</div>}
export function Notice({children,type='info'}:{children:ReactNode;type?:string}) {return <div role={type==='error'?'alert':undefined} className={`notice ${type}`}>{children}</div>}
export function Badge({children,tone=''}:{children:ReactNode;tone?:string}) {return <span className={`badge ${tone}`}>{children}</span>}
const statuses:Record<string,[string,string]>={draft:['Nháp','muted'],confirmed:['Đã chốt','blue'],partial:['Giao một phần','amber'],delivered:['Giao đủ','green'],cancelled:['Đã hủy','red'],active:['Đang áp dụng','green'],expired:['Hết hạn','muted']};
export function Status({value}:{value:string}) {const item=statuses[value]||[value,'']; return <Badge tone={item[1]}>{item[0]}</Badge>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>{if(dialog.open)dialog.close()}},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose()}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20}/></button></div><div className="modal-content">{children}</div></dialog>
}
export function DateRange({from,to,setFrom,setTo}:{from:string;to:string;setFrom:(s:string)=>void;setTo:(s:string)=>void}) {return <div className="date-range"><input type="date" aria-label="Từ ngày" value={from} onChange={e=>setFrom(e.target.value)}/><span>→</span><input type="date" aria-label="Đến ngày" value={to} onChange={e=>setTo(e.target.value)}/></div>}
export function Pager({page,count,onChange,size=15}:{page:number;count:number;onChange:(n:number)=>void;size?:number}) {const pages=Math.max(1,Math.ceil(count/size));return <div className="pager"><span>{count===0?'0':`${(page-1)*size+1}–${Math.min(page*size,count)}`} / {number(count)} kết quả</span><div><Button disabled={page<=1} onClick={()=>onChange(page-1)}>Trước</Button><span>{page} / {pages}</span><Button disabled={page>=pages} onClick={()=>onChange(page+1)}>Sau</Button></div></div>}
