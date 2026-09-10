import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  FileSpreadsheet,
  Home,
  Leaf,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  Truck,
  Users,
} from "lucide-react";
import type { AppState, EmployeeAccount, User } from "../shared/types";
import { AppContext, request, useWorkspace } from "./api";
import { Auth } from "./features/Auth";
import { AdminConsole } from "./features/Admin";
import { Profile } from "./features/Profile";
import { SalesReport } from "./features/SalesReport";
import { Customers, Products } from "./features/Catalog";
import { Imports } from "./features/Imports";
import { OrderEditor, Orders, OrderTable } from "./features/Orders";
import {
  dailyReport,
  dimensionLabels,
  exportSalesCsv,
  groupRows,
  reportRows,
  reportTotals,
} from "./lib/reporting";
import {
  Badge,
  Button,
  Card,
  DateRange,
  Empty,
  Field,
  Heading,
  Modal,
  Notice,
  SearchBox,
  Stat,
  Status,
  day,
  download,
  matches,
  money,
  today,
} from "./ui";
import "./styles.css";
import "./admin.css";

const client = new QueryClient();
const nav = [
  ["/", Home, "Tổng quan"],
  ["/orders", ClipboardList, "Nhập đơn hàng"],
  ["/customers", Users, "Khách hàng"],
  ["/sales", BarChart3, "Doanh số bán hàng"],
  ["/delivered", Truck, "Doanh số thực giao"],
  ["/inventory", Boxes, "Tồn kho"],
  ["/fund", CircleDollarSign, "Quỹ dư"],
  ["/programs", Tag, "Chương trình"],
  ["/products", PackageSearch, "Sản phẩm & bảng giá"],
  ["/report", BookOpenCheck, "Báo cáo cuối ngày"],
  ["/imports", FileSpreadsheet, "Nhập dữ liệu"],
  ["/settings", Settings, "Cài đặt"],
] as const;

function Application() {
  const [session, setSession] = useState<User | null | undefined>(undefined);
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [adminTarget, setAdminTarget] = useState<EmployeeAccount | null>(null);
  const [adminReason, setAdminReason] = useState("");
  const refresh = async () => {
    if (adminTarget) {
      const data = await request<{ state: AppState }>(
        `/api/admin/workspaces/${adminTarget.id}`,
      );
      setState(data.state);
    } else setState(await request<AppState>("/api/state"));
  };
  useEffect(() => {
    request<{ user: User | null }>("/api/auth/session")
      .then((x) => {
        setSession(x.user);
        if (x.user) return refresh();
      })
      .catch(() => setSession(null));
  }, []);
  useEffect(() => {
    if (session) void refresh();
  }, [adminTarget?.id]);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  };
  const command = async (type: string, payload: unknown) => {
    if (!state) throw new Error("Chưa tải dữ liệu");
    setBusy(true);
    try {
      let next: AppState;
      const operation = {
        type,
        payload,
        idempotencyKey: crypto.randomUUID(),
        version: state.version,
        sharedVersion: state.sharedVersion,
      };
      if (adminTarget) {
        if (adminReason.trim().length < 3)
          throw new Error(
            "Nhập lý do quản trị trước khi sửa dữ liệu nhân viên",
          );
        next = await request<AppState>(
          `/api/admin/workspaces/${adminTarget.id}/commands`,
          { command: operation, reason: adminReason },
        );
      } else next = await request<AppState>("/api/commands", operation);
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  };
  const workspaceRequest = async <T = any,>(
    path: string,
    body?: unknown,
    method?: string,
  ): Promise<T> => {
    if (!adminTarget) return request<T>(path, body, method);
    const suffix =
      path === "/api/programs/preview"
        ? "programs/preview"
        : path === "/api/imports/preview" || path === "/api/import/preview"
          ? "imports/preview"
          : "";
    if (!suffix)
      throw new Error(
        "Thao tác này chưa hỗ trợ trong không gian nhân viên được chọn",
      );
    return request<T>(
      `/api/admin/workspaces/${adminTarget.id}/${suffix}`,
      body,
      method,
    );
  };
  if (session === undefined)
    return (
      <div className="boot">
        <Leaf /> Đang mở TrueCare…
      </div>
    );
  if (!session)
    return (
      <Auth
        onLogin={async () => {
          const x = await request<{ user: User | null }>("/api/auth/session");
          setSession(x.user);
          if (x.user) await refresh();
        }}
      />
    );
  if (!state)
    return (
      <div className="boot">
        <Leaf /> Đang tải không gian làm việc…
      </div>
    );
  return (
    <AppContext.Provider
      value={{
        state,
        user: session,
        command,
        workspaceRequest,
        refresh,
        notify,
        busy,
        adminTarget,
        setAdminTarget,
        adminReason,
        setAdminReason,
      }}
    >
      <Workspace
        onLogout={async () => {
          await request("/api/auth/logout", {});
          setSession(null);
          setState(null);
          setAdminTarget(null);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}
function Workspace({ onLogout }: { onLogout: () => void }) {
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const {
    state,
    command,
    user,
    adminTarget,
    setAdminTarget,
    adminReason,
    setAdminReason,
  } = useWorkspace();
  useEffect(() => {
    setTheme(state.settings.theme);
  }, [state.settings.theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const switchTheme = async () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    await command("updateSettings", { theme: next });
  };
  const items =
    user.role === "admin"
      ? [["/admin", ShieldCheck, "Quản trị hệ thống"] as const, ...nav]
      : nav;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Leaf size={22} /> <span>TrueCare</span>
        </div>
        <nav>
          {items.map(([to, Icon, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-small">
            <div className="avatar">{user.displayName.slice(0, 1)}</div>
            <span>
              <b>{user.displayName}</b>
              <small>@{user.username}</small>
            </span>
          </div>
          <button
            className="theme-switch"
            onClick={() => void switchTheme()}
            aria-label="Đổi giao diện"
          >
            {theme === "light" ? (
              <>
                <Sun size={16} /> Sáng
              </>
            ) : (
              <>
                <Moon size={16} /> Tối
              </>
            )}
          </button>
          <button className="logout" onClick={onLogout}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="mobile-header">
          <button
            className="icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Mở menu"
          >
            <Menu />
          </button>
          <strong>
            <Leaf size={18} /> TrueCare
          </strong>
          <button
            className="icon-button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ChevronUp />
          </button>
        </header>
        <div className="content">
          {adminTarget && (
            <div className="admin-target">
              <strong>
                Đang quản trị dữ liệu: {adminTarget.displayName} (@
                {adminTarget.username})
              </strong>
              <input
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
            </div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/admin"
              element={
                user.role === "admin" ? (
                  <AdminConsole />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<OrderEditor />} />
            <Route path="/orders/:id" element={<OrderEditor />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/products" element={<Products />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/sales" element={<SalesReport mode="ordered" />} />
            <Route
              path="/delivered"
              element={<SalesReport mode="delivered" />}
            />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/fund" element={<Fund />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/report" element={<DailyReport />} />
            <Route path="/settings" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
function Dashboard() {
  const { state } = useWorkspace();
  const navigate = useNavigate();
  const recent = state.orders
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  return (
    <>
      <Heading
        title="Tổng quan"
        description="Theo dõi doanh số, quỹ và việc cần xử lý trong cùng một nơi."
        actions={
          <Button variant="primary" onClick={() => navigate("/orders/new")}>
            <Plus size={17} />
            Tạo đơn hàng
          </Button>
        }
      />
      <Notice type="info">
        Môi trường cục bộ: dữ liệu nằm trên máy này. Quỹ chỉ tăng khi bạn ghi
        nhận thực giao.
      </Notice>
      <div className="stats-grid">
        <Stat
          label="Doanh số đặt"
          value={money(state.summary.ordered)}
          detail="Đơn đã chốt"
        />
        <Stat
          label="Doanh số thực giao"
          value={money(state.summary.delivered)}
          detail="Theo ngày giao"
        />
        <Stat
          label="Quỹ khả dụng"
          value={money(state.summary.available)}
          detail={`Đã giữ ${money(state.summary.reserved)}`}
          accent={Number(state.summary.available) < 0 ? "negative" : ""}
        />
        <Stat
          label="Quỹ dự kiến"
          value={money(state.summary.pendingMargin)}
          detail="Phần chưa giao"
        />
      </div>
      <div className="dashboard-grid">
        <Card
          title="Đơn hàng gần đây"
          actions={
            <Button onClick={() => navigate("/orders")}>Xem tất cả</Button>
          }
        >
          {recent.length ? (
            <OrderTable orders={recent} />
          ) : (
            <Empty
              title="Chưa có đơn hàng"
              description="Tạo toa hoặc nhập dữ liệu đã đối chiếu để bắt đầu."
              action={
                <Button
                  variant="primary"
                  onClick={() => navigate("/orders/new")}
                >
                  Tạo đơn đầu tiên
                </Button>
              }
            />
          )}
        </Card>
        <div className="side-stack">
          <Card title="Tiến độ tháng">
            <Progress
              value={Number(state.summary.ordered)}
              target={Number(state.settings.monthlyTarget)}
              label="Doanh số đặt"
            />
            <dl className="metric-list">
              <div>
                <dt>Mục tiêu tháng</dt>
                <dd>{money(state.settings.monthlyTarget)}</dd>
              </div>
              <div>
                <dt>Khách mở mới</dt>
                <dd>
                  {
                    state.customers.filter(
                      (c) => c.openedDate >= state.settings.periodStart,
                    ).length
                  }{" "}
                  / {state.settings.newCustomerTarget}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Tuyến hôm nay">
            <CalendarDays size={25} className="muted-icon" />
            <p>
              {state.customers.filter((c) =>
                c.visitDays.includes(new Date().getDay()),
              ).length
                ? "Có khách cần ghé theo lịch."
                : "Chưa có khách nào được lên lịch hôm nay."}
            </p>
            <Button onClick={() => navigate("/customers")}>
              Xem khách hàng
            </Button>
          </Card>
        </div>
      </div>
      <Card title="Việc cần xử lý">
        <div className="check-list">
          <Checklist
            text={`${state.orders.filter((o) => o.status === "draft").length} toa nháp chưa chốt`}
            href="/orders"
          />
          <Checklist
            text={`${state.summary.unresolved} chứng từ còn thiếu giá vốn hoặc dữ liệu đối chiếu`}
            href="/orders"
            warn={state.summary.unresolved > 0}
          />
          <Checklist
            text={`${state.programs.filter((p) => p.status === "active").length} chương trình đang giữ ngân sách`}
            href="/programs"
          />
        </div>
      </Card>
    </>
  );
}
function Checklist({
  text,
  href,
  warn,
}: {
  text: string;
  href: string;
  warn?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      className={warn ? "check-row warn" : "check-row"}
      onClick={() => navigate(href)}
    >
      <span>{text}</span>
      <span>→</span>
    </button>
  );
}
function Progress({
  value,
  target,
  label,
}: {
  value: number;
  target: number;
  label: string;
}) {
  const pct = target ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div className="progress">
      <div className="progress-top">
        <span>{label}</span>
        <b>{pct.toFixed(1)}%</b>
      </div>
      <div className="progress-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <strong>{money(value)}</strong>
    </div>
  );
}
function Sales({ mode }: { mode: "ordered" | "delivered" }) {
  const { state } = useWorkspace();
  const [from, setFrom] = useState(state.settings.periodStart);
  const [to, setTo] = useState(today());
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<string[]>(["date"]);
  const rows = reportRows(state, mode, { from, to, query: q });
  const total = reportTotals(rows);
  const addGroup = (v: string) =>
    setGroups((x) => (x.includes(v) ? x : [...x, v]));
  return (
    <>
      <Heading
        title={mode === "ordered" ? "Doanh số bán hàng" : "Doanh số thực giao"}
        description={
          mode === "ordered"
            ? "Theo ngày khách đặt, không tự cộng phần giao."
            : "Theo ngày thực giao, bao gồm phần trả trên ngày trả."
        }
        actions={
          <Button
            onClick={() =>
              download(
                `${mode}-${from}-${to}.csv`,
                exportSalesCsv(rows),
                "text/csv;charset=utf-8",
              )
            }
          >
            Xuất CSV
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Khách hàng, sản phẩm, địa chỉ…"
          />
          <Badge>{rows.length} dòng</Badge>
        </div>
        <div className="stats-inline">
          <span>
            Tiền hàng <strong>{money(total.revenue)}</strong>
          </span>
          <span>
            Quỹ{" "}
            {total.margin === null ? (
              <Badge tone="amber">Chưa đủ căn cứ</Badge>
            ) : (
              <strong
                className={Number(total.margin) < 0 ? "negative" : "positive"}
              >
                {money(total.margin)}
              </strong>
            )}
          </span>
          <span>{total.orders} đơn</span>
        </div>
      </Card>
      <div className="report-layout">
        <Card
          title="Tùy biến nhóm"
          subtitle="Chỉ đổi cách xem, không đổi tổng số liệu."
        >
          <div className="group-picker">
            <div>
              <small>Đã chọn</small>
              {groups.map((g, i) => (
                <div className="group-token" key={g}>
                  {dimensionLabels[g]}
                  <button
                    onClick={() => setGroups(groups.filter((x) => x !== g))}
                  >
                    ×
                  </button>
                  {i > 0 && (
                    <button
                      onClick={() =>
                        setGroups(
                          groups.map((x, n) =>
                            n === i ? groups[i - 1] : n === i - 1 ? g : x,
                          ),
                        )
                      }
                    >
                      ↑
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <small>Chưa chọn</small>
              {Object.keys(dimensionLabels)
                .filter((x) => !groups.includes(x))
                .map((g) => (
                  <button
                    key={g}
                    onClick={() => addGroup(g)}
                    className="add-group"
                  >
                    + {dimensionLabels[g]}
                  </button>
                ))}
            </div>
          </div>
        </Card>
        <Card title="Kết quả">
          <Grouped rows={rows} groups={groups} />
        </Card>
      </div>
    </>
  );
}
function Grouped({
  rows,
  groups,
}: {
  rows: ReturnType<typeof reportRows>;
  groups: string[];
}) {
  if (!rows.length) return <Empty title="Không có số liệu trong bộ lọc" />;
  const tree = groupRows(rows, groups);
  return (
    <div className="grouped">
      {tree.map((g) => (
        <Group key={g.key} group={g} />
      ))}
    </div>
  );
}
function Group({ group }: { group: ReturnType<typeof groupRows>[number] }) {
  return (
    <details open>
      <summary>
        <span>{group.value}</span>
        <span>
          {group.quantity} đơn vị · <b>{money(group.total)}</b>
        </span>
      </summary>
      {group.children.length ? (
        group.children.map((c) => <Group key={c.key} group={c} />)
      ) : (
        <div className="group-lines">
          {group.rows.map((r) => (
            <div key={r.id}>
              <span>
                {day(r.date)} · {r.customer} · {r.product}
              </span>
              <b>{money(r.revenue)}</b>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
function Inventory() {
  const { state, command, busy, notify, user } = useWorkspace();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const products = state.products.filter((p) => matches(q, p.name, p.code));
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command("adjustInventory", {
        productId: edit,
        quantity: Number(f.get("quantity")),
        mode: f.get("mode"),
        tracked: f.get("tracked") === "on",
        reason: f.get("reason"),
      });
      setEdit(null);
      notify("Đã cập nhật tồn kho.");
    } catch (err) {
      notify((err as Error).message);
    }
  };
  return (
    <>
      <Heading
        title="Tồn kho"
        description={
          user.role === "admin"
            ? "Kiểm kê tồn thùng/lẻ; hệ thống chỉ trừ khi thực giao."
            : "Tồn thùng/lẻ ở chế độ chỉ xem; hệ thống chỉ trừ khi thực giao."
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Tìm sản phẩm, mã…"
          />
          <Badge>{products.length} SKU</Badge>
        </div>
        {products.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Quy cách</th>
                  <th className="numeric">Tồn thùng</th>
                  <th className="numeric">Tồn lẻ</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const i = state.inventory.find((x) => x.productId === p.id);
                  const q = i?.quantity ?? 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>{p.code}</small>
                      </td>
                      <td>
                        {p.pack} {p.unit}/thùng
                      </td>
                      <td className="numeric">
                        {i?.tracked ? Math.floor(q / p.pack) : "—"}
                      </td>
                      <td className="numeric">
                        {i?.tracked ? q % p.pack : "—"}
                      </td>
                      <td>
                        {!i ? (
                          <Badge tone="amber">Chưa cập nhật</Badge>
                        ) : i.tracked ? (
                          <Badge tone={q ? "green" : "red"}>
                            {q ? "Còn hàng" : "Hết hàng"}
                          </Badge>
                        ) : (
                          <Badge>Tắt theo dõi</Badge>
                        )}
                      </td>
                      <td>
                        {user.role === "admin" ? (
                          <Button onClick={() => setEdit(p.id)}>
                            Điều chỉnh
                          </Button>
                        ) : (
                          <Badge>Chỉ xem</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Chưa có sản phẩm"
            description="Nhập bảng giá trước khi theo dõi tồn."
          />
        )}
      </Card>
      {edit && (
        <Modal title="Điều chỉnh tồn kho" onClose={() => setEdit(null)}>
          <form className="form-stack" onSubmit={save}>
            <Field label="Cách cập nhật">
              <select name="mode">
                <option value="snapshot">Kiểm kê: đặt số tồn thực tế</option>
                <option value="delta">Điều chỉnh tăng / giảm</option>
              </select>
            </Field>
            <Field label="Số lượng đơn vị lẻ">
              <input name="quantity" type="number" step="1" required />
            </Field>
            <label className="checkbox-field">
              <input name="tracked" type="checkbox" defaultChecked />
              Theo dõi tồn của SKU này
            </label>
            <Field label="Lý do">
              <textarea name="reason" required />
            </Field>
            <div className="modal-actions">
              <Button type="button" onClick={() => setEdit(null)}>
                Hủy
              </Button>
              <Button variant="primary" busy={busy}>
                Lưu điều chỉnh
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Fund() {
  const { state, command, busy, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await command(
        f.get("kind") === "opening" ? "openingBalance" : "adjustFund",
        {
          amount: f.get("amount"),
          date: f.get("date"),
          notes: f.get("notes"),
          mode: f.get("mode"),
        },
      );
      setOpen(false);
      notify("Đã ghi sổ quỹ.");
    } catch (x) {
      notify((x as Error).message);
    }
  };
  return (
    <>
      <Heading
        title="Quỹ dư"
        description="Sổ quỹ bất biến. Quỹ phát sinh từ hàng thực giao, không lấy tiền thu khách cộng lần nữa."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            Điều chỉnh quỹ
          </Button>
        }
      />
      <div className="stats-grid">
        <Stat label="Quỹ đã ghi nhận" value={money(state.summary.fund)} />
        <Stat
          label="Ngân sách đang giữ"
          value={money(state.summary.reserved)}
        />
        <Stat
          label="Quỹ khả dụng"
          value={money(state.summary.available)}
          accent={Number(state.summary.available) < 0 ? "negative" : ""}
        />
        <Stat
          label="Quỹ dự kiến chưa giao"
          value={money(state.summary.pendingMargin)}
        />
      </div>
      <Card title="Sổ quỹ">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nghiệp vụ</th>
                <th>Ghi chú</th>
                <th className="numeric">Tăng / giảm</th>
              </tr>
            </thead>
            <tbody>
              {state.ledger.length ? (
                state.ledger
                  .slice()
                  .reverse()
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{day(x.date)}</td>
                      <td>
                        {x.type === "delivery"
                          ? "Thực giao"
                          : x.type === "return"
                            ? "Hàng trả"
                            : x.type === "opening"
                              ? "Mở kỳ"
                              : "Điều chỉnh"}
                      </td>
                      <td>{x.notes}</td>
                      <td
                        className={`numeric ${Number(x.amount) < 0 ? "negative" : "positive"}`}
                      >
                        {money(x.amount)}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <Empty
                      title="Chưa có bút toán quỹ"
                      description="Quỹ sẽ xuất hiện sau lần giao hàng đầu tiên hoặc mở kỳ."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {open && (
        <Modal title="Ghi sổ quỹ" onClose={() => setOpen(false)}>
          <form className="form-stack" onSubmit={save}>
            <Field label="Loại nghiệp vụ">
              <select name="kind">
                <option value="adjust">Điều chỉnh / bổ sung / rút quỹ</option>
                <option value="opening">Số dư đầu kỳ (chỉ một lần)</option>
              </select>
            </Field>
            <Field label="Ngày">
              <input name="date" type="date" defaultValue={today()} required />
            </Field>
            <Field label="Số tiền (âm nếu rút / chi)">
              <input name="amount" type="number" step="1" required />
            </Field>
            <Field label="Cách ghi">
              <select name="mode">
                <option value="delta">Ghi số tiền tăng / giảm</option>
                <option value="balance">Đặt số dư quỹ mong muốn</option>
              </select>
            </Field>
            <Field label="Lý do">
              <textarea name="notes" required />
            </Field>
            <div className="modal-actions">
              <Button type="button" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary" busy={busy}>
                Ghi sổ
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Programs() {
  const { state, command, busy, notify } = useWorkspace();
  const [lines, setLines] = useState<
    { productId: string; quantity: number; price: string }[]
  >([]);
  const [name, setName] = useState("Suất chào hàng");
  const [count, setCount] = useState(1);
  const [allow, setAllow] = useState(false);
  const [expires, setExpires] = useState(today());
  const add = (id: string) => {
    const p = state.products.find((x) => x.id === id)!;
    setLines([...lines, { productId: id, quantity: 1, price: p.price || "0" }]);
  };
  const save = async () => {
    try {
      await command("reserveProgram", {
        name,
        count,
        allowSubsidy: allow,
        expiresAt: expires,
        mode: "bundle",
        lines,
      });
      setLines([]);
      notify("Đã giữ ngân sách cho chương trình.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <Heading
        title="Chương trình & random suất"
        description="Mỗi suất kiểm tra giá chào từng hàng và tối đa 200.000đ quỹ cũ. Xem trước không giữ quỹ."
      />
      <div className="program-grid">
        <Card title="Tạo suất chào">
          <div className="form-stack">
            <Field label="Tên chương trình">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="form-grid">
              <Field label="Số suất">
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Hết hạn">
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Thêm sản phẩm">
              <select
                value=""
                onChange={(e) => e.target.value && add(e.target.value)}
              >
                <option value="">Chọn sản phẩm</option>
                {state.products
                  .filter((p) => p.cost !== null && p.price !== null)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            {lines.map((l, i) => (
              <div className="program-line" key={i}>
                <span>
                  {state.products.find((p) => p.id === l.productId)?.name}
                </span>
                <input
                  type="number"
                  min="1"
                  value={l.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, n) =>
                        n === i
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min="0"
                  value={l.price}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, n) =>
                        n === i ? { ...x, price: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  onClick={() => setLines(lines.filter((_, n) => n !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={allow}
                onChange={(e) => setAllow(e.target.checked)}
              />
              Cho phép dùng quỹ đã giao nếu cần bù
            </label>
            <Notice>
              Hệ thống chặn nếu một suất cần bù quá 200.000đ hoặc tổng số suất
              vượt quỹ khả dụng.
            </Notice>
            <Button
              variant="primary"
              busy={busy}
              disabled={!lines.length}
              onClick={() => void save()}
            >
              Lưu & giữ ngân sách
            </Button>
          </div>
        </Card>
        <Card title="Chương trình đã lưu">
          {state.programs.length ? (
            <div className="program-list">
              {state.programs.map((p) => (
                <div key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.remaining}/{p.count} suất · hết hạn {day(p.expiresAt)}
                    </small>
                  </div>
                  <span>
                    <Status value={p.status} />
                    <b>Giữ {money(p.reserved)}</b>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Chưa có chương trình"
              description="Tạo suất sau khi cập nhật bảng giá, giá vốn và quỹ."
            />
          )}
        </Card>
      </div>
    </>
  );
}
function DailyReport() {
  const { state } = useWorkspace();
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<"ordered" | "delivered">("ordered");
  const text = dailyReport(state, date, mode);
  return (
    <>
      <Heading
        title="Báo cáo cuối ngày"
        description="Xuất theo số liệu trong hệ thống, không tự gửi ra ngoài."
        actions={
          <Button
            variant="primary"
            onClick={() => download(`BCDS-${date}.txt`, text)}
          >
            Tải TXT
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <Field label="Ngày">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <div className="segmented">
            <button
              className={mode === "ordered" ? "active" : ""}
              onClick={() => setMode("ordered")}
            >
              Doanh số đặt
            </button>
            <button
              className={mode === "delivered" ? "active" : ""}
              onClick={() => setMode("delivered")}
            >
              Thực giao
            </button>
          </div>
          <Button onClick={() => navigator.clipboard.writeText(text)}>
            Sao chép
          </Button>
        </div>
        <pre className="report-output">{text}</pre>
      </Card>
    </>
  );
}
function SettingsPage() {
  const { state, command, busy, notify } = useWorkspace();
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
  return (
    <>
      <Heading
        title="Cài đặt"
        description="Mục tiêu, mốc báo cáo và hồ sơ thuộc riêng tài khoản của bạn."
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
      <Card title="Bảo mật">
        <p>
          Đổi mật khẩu và email khôi phục cần cấu hình Supabase trước khi dùng
          dữ liệu thật. Bản cục bộ không gửi email.
        </p>
      </Card>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Application />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
