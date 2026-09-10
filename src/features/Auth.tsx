import {useState,type FormEvent} from 'react';
import {ArrowRight,Check,Eye,EyeOff,Leaf,ShieldCheck} from 'lucide-react';
import {Button,Field,Notice} from '../ui';
import {request} from '../api';

export function Auth({onLogin}:{onLogin:()=>void}){
 const [mode,setMode]=useState<'login'|'register'|'forgot'>('login');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[show,setShow]=useState(false);
 const change=(next:'login'|'register'|'forgot')=>{setMode(next);setError('');setMessage('')};
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{const data=Object.fromEntries(new FormData(e.currentTarget));const result=await request<any>(`/api/auth/${mode}`,data);if(mode==='forgot')setMessage(result.message||'Nếu email hợp lệ, hướng dẫn khôi phục sẽ được gửi.');else onLogin()}catch(err){setError((err as Error).message)}finally{setBusy(false)}};
 return <main className="auth-layout">
  <section className="auth-story"><a className="brand" href="/"><span className="brand-symbol"><Leaf size={23}/></span>TrueCare<span className="brand-dot">.</span></a><div className="auth-story-content"><div className="eyebrow">KHÔNG GIAN LÀM VIỆC CỦA BẠN</div><h1>Bán hàng rõ ràng.<br/>Quỹ dư trong tầm tay.</h1><p>Từ một toa hàng đến cả ngày đi tuyến, theo dõi mọi con số ở cùng một nơi.</p><div className="auth-preview"><div className="preview-label"><span className="green-dot"/> Mỗi giao dịch, một nguồn đối chiếu</div>{['Doanh số đặt và thực giao tách biệt','Quỹ chỉ ghi nhận từ hàng đã giao','Dữ liệu riêng cho từng nhân viên'].map(text=><div className="preview-row" key={text}><Check size={17}/>{text}</div>)}</div></div><div className="auth-foot">TRUECARE · SALES WORKSPACE <span>Thiết kế cho ngày bán hàng của bạn</span></div></section>
  <section className="auth-form-side"><div className="auth-form"><div className="mobile-brand"><Leaf/> TrueCare</div><div className="eyebrow green-text">TRUECARE NHÂN VIÊN</div><h2>{mode==='login'?'Chào mừng bạn trở lại':mode==='register'?'Tạo không gian của bạn':'Khôi phục mật khẩu'}</h2><p>{mode==='login'?'Đăng nhập bằng email để tiếp tục ngày làm việc.':mode==='register'?'Mỗi tài khoản có khách hàng, đơn hàng và quỹ riêng.':'Nhập email đã đăng ký tài khoản TrueCare.'}</p>{error&&<Notice type="error">{error}</Notice>}{message&&<Notice type="success">{message}</Notice>}
   <form key={mode} onSubmit={submit} className="form-stack">
    {mode!=='forgot'&&<Field label="Mã công ty"><input name="companyCode" defaultValue="TRUECARE" required/></Field>}
    {mode==='register'&&<><Field label="Tên hiển thị"><input name="displayName" required autoComplete="name"/></Field><Field label="Tên nội bộ"><input name="username" required autoComplete="username"/></Field></>}
    {mode!=='forgot'&&<Field label="Email đăng nhập"><input name="email" type="email" required autoComplete="email"/></Field>}
    {mode==='forgot'&&<Field label="Email"><input name="email" type="email" required autoComplete="email"/></Field>}
    {mode!=='forgot'&&<Field label="Mật khẩu"><div className="password-input"><input name="password" type={show?'text':'password'} required minLength={mode==='register'?10:1} autoComplete={mode==='register'?'new-password':'current-password'}/><button type="button" aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></Field>}
    {mode==='login'&&<button className="text-button align-right" type="button" onClick={()=>change('forgot')}>Quên mật khẩu?</button>}
    <Button variant="primary" className="full" busy={busy}>{mode==='login'?'Đăng nhập':mode==='register'?'Tạo tài khoản':'Gửi hướng dẫn'}<ArrowRight size={17}/></Button>
   </form>
   <div className="auth-switch">{mode==='login'?'Bạn chưa có tài khoản?':'Đã có tài khoản?'} <button className="text-button" onClick={()=>change(mode==='login'?'register':'login')}>{mode==='login'?'Đăng ký':'Đăng nhập'}</button></div><div className="auth-security"><ShieldCheck size={16}/> Phiên đăng nhập được bảo vệ bởi Supabase</div>
  </div></section>
 </main>;
}
