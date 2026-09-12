import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from '../icons';
import { request, useWorkspace } from "../api";
import { Button, Card, DecisionModal, Field, Heading, Modal, Notice } from "../ui";

export function Profile() {
  const { state, command, busy, notify } = useWorkspace();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [revoking, setRevoking] = useState<any>(null);
  const [error, setError] = useState("");
  const loadSessions = () => request<{items:any[]}>("/api/auth/sessions").then((result) => setSessions(result.items)).catch((cause) => notify(cause.message));
  useEffect(() => { void loadSessions(); }, []);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("updateSettings", {
        displayName: f.get("displayName"),
        dailyTarget: f.get("dailyTarget"),
        monthlyTarget: f.get("monthlyTarget"),
        newCustomerTarget: Number(f.get("newCustomerTarget")),
        aso: Number(f.get("aso")),
        focusProduct: f.get("focusProduct"),
        periodStart: f.get("periodStart"),
      });
      notify("Đã lưu cài đặt cá nhân.");
    } catch (x) {
      notify((x as Error).message);
    }
  };
  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    const next = String(f.get("newPassword") ?? "");
    if (next !== String(f.get("confirmPassword") ?? "")) {
      setError("Xác nhận mật khẩu mới chưa khớp.");
      return;
    }
    try {
      await request("/api/auth/change-password", {
        oldPassword: f.get("oldPassword"),
        newPassword: next,
      });
      setPasswordOpen(false);
      notify("Đã đổi mật khẩu. Phiên đăng nhập hiện tại vẫn được giữ.");
    } catch (x) {
      setError((x as Error).message);
    }
  };
  const logoutAll = async () => {
    try {
      await request("/api/auth/logout-all", {});
      location.assign("/");
    } catch (x) {
      notify((x as Error).message);
    }
  };
  return (
    <>
      <Heading
        eyebrow="HỒ SƠ CÁ NHÂN"
        title="Cài đặt"
        description="Mục tiêu, mốc báo cáo, giao diện và bảo mật thuộc riêng tài khoản của bạn."
      />
      <Card title="Hồ sơ & chỉ tiêu">
        <form className="form-stack" onSubmit={save}>
          <div className="form-grid">
            <Field label="Tên hiển thị">
              <input
                name="displayName"
                defaultValue={state.settings.displayName}
              />
            </Field>
            <Field label="Ngày bắt đầu kỳ">
              <input
                name="periodStart"
                type="date"
                defaultValue={state.settings.periodStart}
              />
            </Field>
            <Field label="Mục tiêu ngày">
              <input
                name="dailyTarget"
                type="number"
                defaultValue={state.settings.dailyTarget}
              />
            </Field>
            <Field label="Mục tiêu tháng">
              <input
                name="monthlyTarget"
                type="number"
                defaultValue={state.settings.monthlyTarget}
              />
            </Field>
            <Field label="Mục tiêu khách mở mới">
              <input
                name="newCustomerTarget"
                type="number"
                defaultValue={state.settings.newCustomerTarget}
              />
            </Field>
            <Field label="ASO mặc định">
              <input
                name="aso"
                type="number"
                defaultValue={state.settings.aso}
              />
            </Field>
            <Field label="Nhãn hàng trọng tâm">
              <input
                name="focusProduct"
                defaultValue={state.settings.focusProduct}
              />
            </Field>
          </div>
          <Button variant="primary" busy={busy}>
            Lưu cài đặt
          </Button>
        </form>
      </Card>
      <Card title="Phiên đăng nhập" subtitle="Tối đa 20 phiên đang hoạt động gần nhất.">
        {sessions.length ? <div className="summary-list">{sessions.map((item) => <div key={item.id}><span><strong>{item.current ? "Thiết bị này" : "Thiết bị khác"}</strong><small>{item.user_agent || "Không có thông tin trình duyệt"} · hoạt động {new Date(item.last_seen_at).toLocaleString("vi-VN")}</small></span><Button onClick={() => setRevoking(item)}>Thu hồi</Button></div>)}</div> : <p>Chưa có phiên được ghi nhận. Các phiên cũ sẽ xuất hiện sau lần đăng nhập tiếp theo.</p>}
      </Card>
      <Card
        title="Bảo mật"
        subtitle="Mật khẩu chỉ được xác thực ở Supabase Auth và không xuất hiện trong nhật ký."
      >
        <div className="settings-security">
          <ShieldCheck size={24} />
          <div>
            <strong>Đổi mật khẩu</strong>
            <p>Mật khẩu mới cần từ 10 đến 200 ký tự.</p>
          </div>
          <Button
            onClick={() => {
              setError("");
              setPasswordOpen(true);
            }}
          >
            <KeyRound size={16} />
            Đổi mật khẩu
          </Button>
          <Button onClick={() => setLogoutOpen(true)}>
            <LogOut size={16} />
            Đăng xuất mọi thiết bị
          </Button>
        </div>
      </Card>
      {passwordOpen && (
        <Modal title="Đổi mật khẩu" onClose={() => setPasswordOpen(false)}>
          <form className="form-stack" onSubmit={changePassword}>
            {error && <Notice type="error">{error}</Notice>}
            <Field label="Mật khẩu hiện tại">
              <input
                name="oldPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Mật khẩu mới">
              <input
                name="newPassword"
                type="password"
                minLength={10}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Xác nhận mật khẩu mới">
              <input
                name="confirmPassword"
                type="password"
                minLength={10}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </Field>
            <div className="modal-actions">
              <Button type="button" onClick={() => setPasswordOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary">Cập nhật mật khẩu</Button>
            </div>
          </form>
        </Modal>
      )}
      {logoutOpen && <DecisionModal title="Đăng xuất mọi thiết bị" description="Mọi phiên đăng nhập hiện có, gồm thiết bị này, sẽ bị thu hồi." confirmLabel="Đăng xuất" danger onClose={() => setLogoutOpen(false)} onConfirm={logoutAll}/>}
      {revoking && <DecisionModal title="Thu hồi phiên đăng nhập" description={revoking.current ? "Bạn sẽ đăng xuất khỏi thiết bị này." : "Thiết bị đã chọn sẽ phải đăng nhập lại."} confirmLabel="Thu hồi" danger onClose={() => setRevoking(null)} onConfirm={async () => { const result = await request<{current:boolean}>(`/api/auth/sessions/${revoking.id}`, {}, "DELETE"); if (result.current) location.assign("/"); else await loadSessions(); }}/>}
    </>
  );
}
