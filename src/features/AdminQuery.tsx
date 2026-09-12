import type { TeamMember } from '../../shared/types';
import { Button, DateRange, Notice, SearchBox } from '../ui';
import { usePagedQuery } from '../lib/usePagedQuery';
export function AdminQuery({query,members,statuses,dates=true}:{query:ReturnType<typeof usePagedQuery<any>>;members?:TeamMember[];statuses?:Record<string,string>;dates?:boolean}) {
  const update=(key:string,value:string)=>query.setDraft(current=>({...current,[key]:value}));
  return <><div className="toolbar">
    <SearchBox value={query.draft.q??''} onChange={value=>update('q',value)}/>
    {members&&<select aria-label="Nhân viên" value={query.draft.ownerId??''} onChange={event=>update('ownerId',event.target.value)}><option value="">Mọi nhân viên</option>{members.map(member=><option key={member.id} value={member.id}>{member.displayName}</option>)}</select>}
    {statuses&&<select aria-label="Trạng thái" value={query.draft.status??'all'} onChange={event=>update('status',event.target.value)}>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}
    {dates&&<DateRange from={query.draft.from??''} to={query.draft.to??''} setFrom={value=>update('from',value)} setTo={value=>update('to',value)}/>}
    <Button onClick={()=>query.apply()}>Áp dụng</Button><Button onClick={()=>query.apply(true)}>Đặt lại</Button>
  </div>{query.loading&&<div role="status" className="loading-row">Đang tải dữ liệu…</div>}{query.error&&<Notice type="error">{query.error} <Button onClick={query.reload}>Thử lại</Button></Notice>}</>;
}
