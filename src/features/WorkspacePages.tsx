import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, Plus, Icon, RotateCcw } from "../icons";
import { useWorkspace } from "../api";
import { OrderTable } from "./Orders";
import { attendanceForDate, dailyReport } from "../lib/reporting";
import { AttendancePanel } from "./AttendancePanel";
import {
  Badge,
  Button,
  Card,
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
} from "../ui";
export function Dashboard() {
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
        Quỹ và KPI chỉ cập nhật theo số lượng thực giao; toa nháp không làm thay
        đổi số liệu đã đạt.
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
      <Icon name="arrow-right" size={16} />
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
      <progress
        className="progress-track"
        value={pct}
        max={100}
        aria-label={label}
      />
      <strong>{money(value)}</strong>
    </div>
  );
}
export function Inventory() {
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
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn">
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
export function Fund() {
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
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn">
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
export { Programs } from "./Programs";
export function DailyReport() {
  const { state, command, busy, notify } = useWorkspace();
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<"ordered" | "delivered">("ordered");
  const text = dailyReport(state, date, mode);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Đã sao chép báo cáo để gửi Zalo.");
    } catch {
      notify("Trình duyệt chưa cho phép sao chép. Bạn có thể bôi đen báo cáo để copy thủ công.");
    }
  };
  const reset = () => {
    setDate(today());
    setMode("ordered");
  };
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
          <Button onClick={() => void copy()}>
            Sao chép báo cáo
          </Button>
          <Button onClick={reset} title="Chỉ đặt lại ngày và chế độ xem; không xóa số liệu">
            <RotateCcw size={16} />
            Đặt lại báo cáo
          </Button>
        </div>
        <AttendancePanel date={date} />
        <Notice>Thời gian đã bán là ngày làm thực tế; tổng ngày là kế hoạch. Đặt lại chỉ đổi bộ lọc.</Notice>
        <textarea className="report-output" aria-label="Nội dung báo cáo để sao chép" readOnly value={text} rows={17} onFocus={e => e.currentTarget.select()} />
      </Card>
    </>
  );
}
