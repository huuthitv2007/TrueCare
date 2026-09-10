import { useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { request, useWorkspace } from "../api";
import { Button, Card, Field, Heading, Modal, Notice } from "../ui";

export function Profile() {
  const { state, command, busy, notify } = useWorkspace();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [error, setError] = useState("");
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
    if (!confirm("Đăng xuất tài khoản khỏi tất cả thiết bị?")) return;
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
          <Button onClick={() => void logoutAll()}>
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
    </>
  );
}
