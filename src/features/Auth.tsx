import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Moon, Sun, ShieldCheck } from "../icons";
import { Button, Field, Notice } from "../ui";
import { request } from "../api";
import { Brand } from "../Brand";
import { applyTheme, readTheme } from "../theme";

export function Auth({ onLogin }: { onLogin: () => void }) {
  const modeFromPath = () => window.location.pathname === "/reset-password" ? "reset" as const : window.location.pathname === "/forgot-password" ? "forgot" as const : "login" as const;
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(modeFromPath);
  const recoveryStarted = useRef(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(() => new URLSearchParams(window.location.search).has("passwordReset") ? "Đã đổi mật khẩu và đăng xuất các phiên cũ. Vui lòng đăng nhập lại." : ""),
    [show, setShow] = useState(false);
  const [theme, setTheme] = useState(() => readTheme("truecare-theme"));
  useEffect(() => {
    const onPopState = () => { setMode(modeFromPath()); setError(""); setMessage(""); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (mode !== "reset" || recoveryStarted.current) return;
    recoveryStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const flowId = params.get("sb_flow_id") || undefined;
    // Never leave authorization codes or legacy implicit tokens in history/referrers.
    window.history.replaceState(null, "", "/reset-password");
    if (!code) {
      setError("Liên kết không hợp lệ hoặc đã mở trước đó. Hãy yêu cầu liên kết mới và mở bằng trình duyệt đã gửi yêu cầu.");
      return;
    }
    setBusy(true);
    request("/api/auth/recovery/exchange", { code, flowId })
      .then(() => setRecoveryReady(true))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [mode]);
  useEffect(() => {
    applyTheme(theme);
    document.title = `${mode === "login" ? "Đăng nhập" : "Khôi phục mật khẩu"} · TrueCare`;
  }, [theme, mode]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      if (mode === "reset") {
        if (data.password !== data.confirmPassword) throw new Error("Mật khẩu xác nhận không khớp");
        await request("/api/auth/recovery/reset", { password: data.password, confirmPassword: data.confirmPassword });
        window.location.assign("/login?passwordReset=1");
      } else if (mode === "forgot") {
        const result = await request<{ message: string }>(
          "/api/auth/forgot-password",
          { email: data.login },
        );
        setMessage(result.message);
      } else {
        await request("/api/auth/login", {
          companyCode: data.companyCode,
          login: data.login,
          password: data.password,
        });
        await onLogin();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changeMode = () => {
    const next = mode === "login" || mode === "reset" ? "forgot" : "login";
    window.history.pushState(null, "", next === "forgot" ? "/forgot-password" : "/login");
    setMode(next);
    setError("");
    setMessage("");
    setShow(false);
  };
  return (
    <div className="auth-page">
      <header className="auth-header">
        <button
          className="icon-button"
          aria-label={`Chuyển sang giao diện ${theme === "light" ? "tối" : "sáng"}`}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </button>
      </header>
      <main className="auth-main">
        <section
          className="kt-card auth-card"
          aria-labelledby={mode !== "login" ? "auth-title" : undefined}
          aria-label={mode === "login" ? "TrueCare" : undefined}
        >
          <a href="/" className="auth-brand" aria-label="TrueCare">
            <Brand />
          </a>
          <div className="auth-heading">
            {mode === "forgot" && (
              <>
                <h1 id="auth-title">Khôi phục mật khẩu</h1>
                <p>Nhập email hoặc tên đăng nhập đã được cấp.</p>
              </>
            )}
            {mode === "reset" && <><h1 id="auth-title">Đặt mật khẩu mới</h1><p>Mật khẩu từ 10 đến 200 ký tự. Sau khi đổi, các phiên đăng nhập cũ sẽ bị thu hồi.</p></>}
          </div>
          {error && <Notice type="error">{error}</Notice>}
          {message && <Notice type="success">{message}</Notice>}
          {(mode !== "reset" || recoveryReady) && <form key={mode} onSubmit={submit} className="form-stack">
            {mode === "login" && (
              <Field label="Mã công ty">
                <input
                  name="companyCode"
                  defaultValue="TRUECARE"
                  required
                  autoCapitalize="characters"
                />
              </Field>
            )}
            {mode !== "reset" && <Field label="Email hoặc tên đăng nhập">
              <input
                name="login"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>}
            {(mode === "login" || mode === "reset") && (
              <>
                <Field label={mode === "reset" ? "Mật khẩu mới" : "Mật khẩu"}>
                  <div className="password-input">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      required
                      minLength={mode === "reset" ? 10 : undefined}
                      maxLength={mode === "reset" ? 200 : undefined}
                      autoComplete={mode === "reset" ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
                {mode === "reset" && <Field label="Xác nhận mật khẩu mới"><input name="confirmPassword" type={show ? "text" : "password"} required minLength={10} maxLength={200} autoComplete="new-password" /></Field>}
                {mode === "login" && <button
                  className="text-button align-right"
                  type="button"
                  onClick={changeMode}
                >
                  Quên mật khẩu?
                </button>}
              </>
            )}
            <Button
              type="submit"
              variant="primary"
              className="full"
              busy={busy}
            >
              {mode === "login" ? "Đăng nhập" : mode === "reset" ? "Đổi mật khẩu" : "Gửi hướng dẫn"}
              <ArrowRight size={17} />
            </Button>
          </form>}
          <div className="auth-switch">
            {mode === "login" ? (
              "Cần tài khoản mới? Liên hệ quản trị viên."
            ) : (
              <button className="text-button" onClick={changeMode}>
                {mode === "reset" ? "Yêu cầu liên kết mới" : "Trở lại đăng nhập"}
              </button>
            )}
          </div>
          <div className="auth-security">
            <ShieldCheck size={17} />
            <span>Tài khoản do quản trị viên TrueCare cấp</span>
          </div>
        </section>
      </main>
      <footer className="auth-footer">
        © {new Date().getFullYear()} TrueCare · Không gian làm việc
      </footer>
    </div>
  );
}
