import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request } from '../api';
export function usePagedQuery<T>(path:string, prefix:string, defaults:Record<string,string>) {
  const [params,setParams]=useSearchParams();
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(defaults))query.set(key,params.get(`${prefix}.${key}`)??value);
  query.set('page',params.get(`${prefix}.page`)??'1');query.set('pageSize','25');
  const queryString=query.toString();
  const [draft,setDraft]=useState<Record<string,string>>(()=>Object.fromEntries(query));
  const [data,setData]=useState<{items:T[];total:number;page:number}|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const sequence=useRef(0);
  useEffect(()=>{setDraft(Object.fromEntries(new URLSearchParams(queryString)));},[queryString]);
  useEffect(()=>{
    const ticket=++sequence.current;setLoading(true);setError('');
    request<{items:T[];total:number;page:number}>(`${path}?${queryString}`).then(result=>{if(ticket===sequence.current)setData(result);}).catch(cause=>{if(ticket===sequence.current)setError(cause.message);}).finally(()=>{if(ticket===sequence.current)setLoading(false);});
    return()=>{sequence.current++;};
  },[path,queryString,revision]);
  const apply=(reset=false)=>setParams(previous=>{
    const next=new URLSearchParams(previous);
    for(const [key,value] of Object.entries(reset?defaults:draft))if(key!=='pageSize')next.set(`${prefix}.${key}`,value);
    next.set(`${prefix}.page`,'1');return next;
  });
  const setPage=(page:number)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set(`${prefix}.page`,String(page));return next;});
  return {data,error,loading,draft,setDraft,apply,setPage,resetKey:queryString,page:Number(query.get('page'))||1,reload:()=>setRevision(value=>value+1)};
}
