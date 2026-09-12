import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useWorkspace } from "./api";
import { Brand } from "./Brand";
import { applyTheme, readTheme } from "./theme";
import { Icon } from "./icons";

export const navigation = [
  ["/", "element-11", "Tổng quan"],
  ["/orders", "notepad", "Nhập đơn hàng"],
  ["/customers", "people", "Khách hàng"],
  ["/sales", "chart-simple", "Doanh số bán hàng"],
  ["/delivered", "delivery", "Doanh số thực giao"],
  ["/inventory", "parcel", "Tồn kho"],
  ["/fund", "wallet", "Quỹ dư"],
  ["/programs", "discount", "Chương trình"],
  ["/products", "package", "Sản phẩm & bảng giá"],
  ["/report", "document", "Báo cáo cuối ngày"],
  ["/imports", "file-up", "Nhập dữ liệu"],
  ["/settings", "setting-2", "Cài đặt"],
] as const;

export function AppShell({
  children,
  onLogout,
}: {
  children: ReactNode;
  onLogout: () => void;
}) {
  const {
    user,
    state,
    command,
    notify,
    adminTarget,
    setAdminTarget,
    adminReason,
    setAdminReason,
  } = useWorkspace();
  const location = useLocation();
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 1023px)").matches,
  );
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(() =>
    readTheme(`truecare-theme:${user.id}`, state.settings.theme),
  );
  const [themeBusy, setThemeBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(media.matches);
      setMenu(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    applyTheme(theme, user.id);
  }, [theme, user.id]);
  const switchTheme = async () => {
    if (themeBusy) return;
    const previous = theme,
      next = theme === "light" ? "dark" : "light";
    setTheme(next);
    setThemeBusy(true);
    try {
      if (!adminTarget) await command("updateSettings", { theme: next });
    } catch (error) {
      setTheme(previous);
      notify((error as Error).message);
    } finally {
      setThemeBusy(false);
    }
  };
  const logout = async () => {
    setLogoutBusy(true);
    try {
      await onLogout();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLogoutBusy(false);
    }
  };
  const title = location.pathname.startsWith("/admin")
    ? "Quản trị hệ thống"
    : (navigation.find(
        ([path]) => path !== "/" && location.pathname.startsWith(path),
      )?.[2] ?? "Tổng quan");
  useEffect(() => {
    document.title = `${title} · TrueCare`;
  }, [title]);
  const sidebar = (
    <>
      <div className="kt-sidebar-header">
        <NavLink
          to="/"
          aria-label="TrueCare — Tổng quan"
          className="brand-link"
        >
          <Brand className="sidebar-brand" />
        </NavLink>
        {mobile ? (
          <Dialog.Close className="icon-button" aria-label="Đóng menu">
            <Icon name="cross" />
          </Dialog.Close>
        ) : (
          <button
            className="sidebar-toggle icon-button"
            aria-label={
              collapsed
                ? "Mở rộng thanh điều hướng"
                : "Thu gọn thanh điều hướng"
            }
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "double-right" : "double-left"} size={16} />
          </button>
        )}
      </div>
      <nav className="workspace-nav kt-menu" aria-label="Điều hướng chính">
        <span className="nav-section-label">Không gian làm việc</span>
        {navigation.map(([to, icon, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `workspace-nav-link kt-menu-link${isActive ? " active" : ""}`
            }
            title={collapsed && !mobile ? label : undefined}
            onClick={() => setMenu(false)}
          >
            <Icon name={icon} size={20} />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
        {user.role === "admin" && (
          <>
            <span className="nav-section-label">Quản trị</span>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `workspace-nav-link kt-menu-link${isActive ? " active" : ""}`
              }
              title="Quản trị hệ thống"
            >
              <Icon name="shield-tick" />
              <span className="nav-label">Quản trị hệ thống</span>
            </NavLink>
          </>
        )}
      </nav>
      <div className="sidebar-account">
        <div className="avatar" aria-hidden="true">
          {user.displayName.slice(0, 1)}
        </div>
        <div className="nav-label">
          <strong>{user.displayName}</strong>
          <small>
            {user.role === "admin" ? "Quản trị viên" : `@${user.username}`}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="Đăng xuất"
          title="Đăng xuất"
          disabled={logoutBusy}
          onClick={() => void logout()}
        >
          <Icon name="exit-right" />
        </button>
      </div>
    </>
  );
  return (
    <Dialog.Root open={mobile && menu} onOpenChange={setMenu}>
      <div
        className={`demo1 kt-sidebar-fixed kt-header-fixed app-shell ${collapsed && !mobile ? "navigation-collapsed" : ""}`}
      >
        <a className="skip-link" href="#workspace-content">
          Bỏ qua điều hướng
        </a>
        {!mobile && (
          <aside className="kt-sidebar" aria-label="Thanh điều hướng">
            {sidebar}
          </aside>
        )}
        {mobile && (
          <Dialog.Portal>
            <Dialog.Overlay className="drawer-backdrop" />
            <Dialog.Content
              className="kt-sidebar mobile-drawer"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">Menu TrueCare</Dialog.Title>
              {sidebar}
            </Dialog.Content>
          </Dialog.Portal>
        )}
        <div className="kt-wrapper">
          <header className="kt-header">
            <div className="header-start">
              {mobile && (
                <>
                  <Dialog.Trigger asChild>
                    <button className="icon-button" aria-label="Mở menu">
                      <Icon name="menu" />
                    </button>
                  </Dialog.Trigger>
                  <NavLink
                    to="/"
                    className="mobile-logo"
                    aria-label="TrueCare — Tổng quan"
                  >
                    <Brand className="mobile-brand" />
                  </NavLink>
                </>
              )}
              <div className="breadcrumb">
                <span>TrueCare</span>
                <Icon name="right" size={12} />
                <strong>{title}</strong>
              </div>
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                aria-label={`Chuyển sang giao diện ${theme === "light" ? "tối" : "sáng"}`}
                disabled={themeBusy}
                onClick={() => void switchTheme()}
              >
                <Icon name={theme === "light" ? "moon" : "sun"} />
              </button>
              <NavLink
                to="/settings"
                className="header-account"
                aria-label={`Cài đặt tài khoản ${user.displayName}`}
              >
                <span>
                  {user.displayName}
                  <small>
                    {user.role === "admin" ? "Quản trị viên" : "Nhân viên"}
                  </small>
                </span>
                <div className="avatar" aria-hidden="true">
                  {user.displayName.slice(0, 1)}
                </div>
              </NavLink>
            </div>
          </header>
          <main
            id="workspace-content"
            tabIndex={-1}
            className="kt-container-fixed workspace-content"
          >
            {adminTarget && (
              <section
                className="admin-target"
                aria-label="Không gian đang quản trị"
              >
                <strong>
                  Đang quản trị dữ liệu: {adminTarget.displayName} (@
                  {adminTarget.username})
                </strong>
                <input
                  aria-label="Lý do thao tác trong không gian nhân viên"
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  placeholder="Lý do thao tác quản trị (bắt buộc khi lưu)"
                />
                <button
                  onClick={() => {
                    setAdminTarget(null);
                    setAdminReason("");
                  }}
                >
                  Thoát chế độ quản trị
                </button>
              </section>
            )}
            {children}
          </main>
          <footer className="kt-container-fixed workspace-footer">
            <span>© {new Date().getFullYear()} TrueCare</span>
            <span>Không gian làm việc</span>
          </footer>
        </div>
      </div>
    </Dialog.Root>
  );
}
