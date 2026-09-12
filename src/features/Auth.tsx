import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Moon, Sun, ShieldCheck } from "../icons";
import { Button, Field, Notice } from "../ui";
import { request } from "../api";
import { Brand } from "../Brand";
import { applyTheme, readTheme } from "../theme";

export function Auth({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [show, setShow] = useState(false);
  const [theme, setTheme] = useState(() => readTheme("truecare-theme"));
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
      if (mode === "forgot") {
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
    setMode(mode === "login" ? "forgot" : "login");
    setError("");
    setMessage("");
    setShow(false);
  };
  return (
    <div className="auth-page">
      <header className="auth-header">
        <a href="/" aria-label="TrueCare">
          <Brand />
        </a>
        <button
          className="icon-button"
          aria-label={`Chuyển sang giao diện ${theme === "light" ? "tối" : "sáng"}`}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon /> : <Sun />}
        </button>
      </header>
      <main className="auth-main">
        <section className="kt-card auth-card" aria-labelledby="auth-title">
          <div className="auth-heading">
            <h1 id="auth-title">
              {mode === "login" ? "Đăng nhập" : "Khôi phục mật khẩu"}
            </h1>
            <p>
              {mode === "login"
                ? "Chào mừng bạn trở lại với TrueCare."
                : "Nhập email hoặc tên đăng nhập đã được cấp."}
            </p>
          </div>
          {error && <Notice type="error">{error}</Notice>}
          {message && <Notice type="success">{message}</Notice>}
          <form key={mode} onSubmit={submit} className="form-stack">
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
            <Field label="Email hoặc tên đăng nhập">
              <input
                name="login"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            {mode === "login" && (
              <>
                <Field label="Mật khẩu">
                  <div className="password-input">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      required
                      autoComplete="current-password"
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
                <button
                  className="text-button align-right"
                  type="button"
                  onClick={changeMode}
                >
                  Quên mật khẩu?
                </button>
              </>
            )}
            <Button
              type="submit"
              variant="primary"
              className="full"
              busy={busy}
            >
              {mode === "login" ? "Đăng nhập" : "Gửi hướng dẫn"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? (
              "Cần tài khoản mới? Liên hệ quản trị viên."
            ) : (
              <button className="text-button" onClick={changeMode}>
                Trở lại đăng nhập
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
