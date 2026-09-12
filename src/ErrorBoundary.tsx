import { Component, type ErrorInfo, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(_error:Error,_info:ErrorInfo){
    // Only an event code is logged: never customer data, form fields or tokens.
    console.error('TRUECARE_RENDER_FAILURE');
  }
  render(){return this.state.failed?<main className="boot"><div role="alert" className="kt-card card"><div className="card-body form-stack"><h1>Không thể hiển thị màn hình</h1><p>Vui lòng tải lại trang để thử lại.</p><button className="kt-btn btn primary" onClick={()=>location.reload()}>Tải lại</button></div></div></main>:this.props.children;}
}
