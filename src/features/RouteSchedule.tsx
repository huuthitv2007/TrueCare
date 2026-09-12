import { useMemo, useState, type FormEvent } from "react";
import type { RouteSchedule } from "../../shared/types";
import { useWorkspace } from "../api";
import { CalendarDays, Check, Pencil, Plus, Trash2 } from "../icons";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Modal,
  Notice,
  Status,
  day,
  today,
} from "../ui";

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return toIso(value);
};
const monthStart = (date: string) => date.slice(0, 7) + "-01";
const monthEnd = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return toIso(new Date(Date.UTC(year, month, 0, 12)));
};
const weekStart = (date: string) => {
  const value = new Date(date + "T12:00:00Z");
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return toIso(value);
};
const statusLabel = (status: RouteSchedule["status"]) =>
  status === "completed" ? "Đã thực hiện" : status === "cancelled" ? "Đã hủy" : "Đã lên lịch";

export function RouteSchedulePage() {
  const { state, command, busy, notify, user, adminTarget } = useWorkspace();
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [date, setDate] = useState(today());
  const [route, setRoute] = useState("");
  const [editing, setEditing] = useState<RouteSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<RouteSchedule | null>(null);
  const [deleting, setDeleting] = useState<RouteSchedule | null>(null);
  const routes = useMemo(
    () => [
      ...new Set([
        ...(state.catalogs?.routes ?? []),
        ...state.customers.map((customer) => customer.route).filter(Boolean),
      ]),
    ],
    [state.catalogs?.routes, state.customers],
  );
  const range = useMemo(() => {
    if (view === "month") return { from: monthStart(date), to: monthEnd(date) };
    if (view === "week") {
      const from = weekStart(date);
      return { from, to: addDays(from, 6) };
    }
    return { from: date, to: date };
  }, [date, view]);
  const rows = (state.routeSchedules ?? [])
    .filter((item) => !item.deletedAt)
    .filter((item) => item.date >= range.from && item.date <= range.to)
    .filter((item) => !route || item.route === route)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const customerName = (id: string) => state.customers.find((customer) => customer.id === id)?.name ?? "Khách đã lưu trữ";
  const remove = async (reason: string) => {
    if (!deleting) return;
    await command("deleteRouteSchedule", { id: deleting.id, reason });
    setDeleting(null);
    notify("Đã xóa lịch theo tuyến.");
  };
  return (
    <>
      <Heading
        eyebrow="TUYẾN CHĂM SÓC"
        title="Lịch Theo Tuyến"
        description={
          user.role === "admin" && adminTarget
            ? `Đang xem và cập nhật lịch của ${adminTarget.displayName}.`
            : "Quản lý lịch chăm sóc khách hàng hằng ngày theo tuyến được phân công."
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Tạo lịch
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <Field label="Mốc ngày">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <div className="segmented" aria-label="Kiểu xem lịch">
            <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>Ngày</button>
            <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Tuần</button>
            <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Tháng</button>
          </div>
          <Field label="Tuyến">
            <select value={route} onChange={(event) => setRoute(event.target.value)}>
              <option value="">Tất cả tuyến</option>
              {routes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Badge>{rows.length} lịch</Badge>
        </div>
      </Card>
      <Card title={`Lịch từ ${day(range.from)} đến ${day(range.to)}`}>
        {rows.length ? (
          <div className="route-schedule-list">
            {rows.map((item) => (
              <article className="kt-card route-schedule-card" key={item.id}>
                <div>
                  <strong>{day(item.date)} · {item.startTime}–{item.endTime}</strong>
                  <small>{item.route}</small>
                </div>
                <div className="route-schedule-meta">
                  <Status value={item.status} />
                  <Badge>{item.customerIds.length} khách</Badge>
                  <span>{statusLabel(item.status)}</span>
                </div>
                {item.notes && <p>{item.notes}</p>}
                <div className="route-customer-chips">
                  {item.customerIds.length ? item.customerIds.map((id) => <span key={id}>{customerName(id)}</span>) : <span>Chưa có khách trong tuyến</span>}
                </div>
                {item.resultNotes && <Notice>{item.resultNotes}</Notice>}
                <div className="heading-actions">
                  <Button onClick={() => setEditing(item)}><Pencil size={14} />Sửa</Button>
                  <Button onClick={() => setCompleting(item)}><Check size={14} />Đã thực hiện</Button>
                  <Button variant="danger" onClick={() => setDeleting(item)}><Trash2 size={14} />Xóa</Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Chưa có lịch theo tuyến"
            description="Tạo lịch mới hoặc đổi bộ lọc ngày/tuyến để xem các lịch đã lên."
            action={<Button variant="primary" onClick={() => setCreating(true)}><CalendarDays size={16} />Tạo lịch</Button>}
          />
        )}
      </Card>
      {(creating || editing) && (
        <ScheduleForm
          schedule={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {completing && <CompleteSchedule schedule={completing} onClose={() => setCompleting(null)} />}
      {deleting && (
        <DeleteSchedule
          schedule={deleting}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={(reason) => void remove(reason)}
        />
      )}
    </>
  );
}

function activeCustomers(state: ReturnType<typeof useWorkspace>["state"], route: string) {
  return state.customers.filter(
    (customer) =>
      !customer.archived &&
      !customer.deletedAt &&
      !customer.mergedInto &&
      (!route || customer.route === route),
  );
}

function ScheduleForm({ schedule, onClose, onSaved }: { schedule: RouteSchedule | null; onClose: () => void; onSaved: () => void }) {
  const { state, command, busy, notify } = useWorkspace();
  const routes = [
    ...new Set([
      ...(state.catalogs?.routes ?? []),
      ...state.customers.map((customer) => customer.route).filter(Boolean),
    ]),
  ];
  const initialRoute = schedule?.route ?? routes[0] ?? "";
  const [route, setRoute] = useState(initialRoute);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(schedule?.customerIds ?? activeCustomers(state, initialRoute).map((customer) => customer.id)),
  );
  const customers = activeCustomers(state, route);
  const changeRoute = (next: string) => {
    setRoute(next);
    setSelected(new Set(activeCustomers(state, next).map((customer) => customer.id)));
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await command("saveRouteSchedule", {
        id: schedule?.id,
        date: form.get("date"),
        startTime: form.get("startTime"),
        endTime: form.get("endTime"),
        route,
        notes: form.get("notes"),
        customerIds: [...selected],
      });
      notify(schedule ? "Đã cập nhật lịch theo tuyến." : "Đã tạo lịch theo tuyến.");
      onSaved();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  return (
    <Modal title={schedule ? "Sửa lịch theo tuyến" : "Tạo lịch theo tuyến"} onClose={onClose} wide>
      <form className="form-stack" onSubmit={save}>
        <div className="form-grid">
          <Field label="Ngày thực hiện"><input name="date" type="date" defaultValue={schedule?.date ?? today()} required /></Field>
          <Field label="Bắt đầu"><input name="startTime" type="time" defaultValue={schedule?.startTime ?? "08:00"} required /></Field>
          <Field label="Kết thúc"><input name="endTime" type="time" defaultValue={schedule?.endTime ?? "11:00"} required /></Field>
          <Field label="Tuyến">
            <select value={route} onChange={(event) => changeRoute(event.target.value)} required>
              <option value="">Chọn tuyến</option>
              {routes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Ghi chú"><textarea name="notes" defaultValue={schedule?.notes} /></Field>
        <Card title="Khách hàng trong tuyến" subtitle="Hệ thống tự lấy khách hàng đang hoạt động theo tuyến đã chọn.">
          <div className="toolbar">
            <Button type="button" onClick={() => setSelected(new Set(customers.map((customer) => customer.id)))}>Chọn tất cả</Button>
            <Button type="button" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
            <Badge>{selected.size}/{customers.length} khách</Badge>
          </div>
          {customers.length ? (
            <div className="route-customer-picker">
              {customers.map((customer) => (
                <label className="checkbox-row" key={customer.id}>
                  <input type="checkbox" checked={selected.has(customer.id)} onChange={() => toggle(customer.id)} />
                  <span><strong>{customer.name}</strong><small>{customer.address || customer.phone || "Chưa có địa chỉ"}</small></span>
                </label>
              ))}
            </div>
          ) : (
            <Empty title="Tuyến chưa có khách hàng" description="Bạn vẫn có thể lưu lịch để ghi chú tuyến cần bổ sung khách." />
          )}
        </Card>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>Hủy</Button>
          <Button variant="primary" busy={busy}>Lưu lịch</Button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteSchedule({ schedule, onClose }: { schedule: RouteSchedule; onClose: () => void }) {
  const { state, command, busy, notify } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(schedule.completedCustomerIds ?? schedule.customerIds));
  const customers = schedule.customerIds.map((id) => state.customers.find((customer) => customer.id === id)).filter(Boolean) as typeof state.customers;
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await command("completeRouteSchedule", {
        id: schedule.id,
        completedCustomerIds: [...selected],
        resultNotes: form.get("resultNotes"),
      });
      notify("Đã hoàn thành lịch và ghi nhận chăm sóc khách hàng.");
      onClose();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  return (
    <Modal title="Hoàn thành lịch theo tuyến" onClose={onClose} wide>
      <form className="form-stack" onSubmit={save}>
        <Notice>Chọn khách đã chăm sóc thực tế. Hệ thống ghi lượt chăm sóc để dùng lại trong báo cáo cuối ngày.</Notice>
        {customers.length ? customers.map((customer) => (
          <label className="checkbox-row" key={customer.id}>
            <input type="checkbox" checked={selected.has(customer.id)} onChange={() => toggle(customer.id)} />
            {customer.name}
          </label>
        )) : <Empty title="Lịch không có khách" description="Bạn vẫn có thể hoàn thành lịch với ghi chú kết quả tuyến." />}
        <Field label="Ghi chú kết quả"><textarea name="resultNotes" defaultValue={schedule.resultNotes} /></Field>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>Hủy</Button>
          <Button variant="primary" busy={busy}>Lưu kết quả</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteSchedule({ schedule, busy, onClose, onConfirm }: { schedule: RouteSchedule; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Xóa lịch theo tuyến" onClose={onClose}>
      <div className="form-stack">
        <Notice type="warning">Lịch {day(schedule.date)} tuyến {schedule.route} sẽ được hủy và ẩn khỏi danh sách mặc định.</Notice>
        <Field label="Lý do"><textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} /></Field>
        <div className="modal-actions">
          <Button onClick={onClose} disabled={busy}>Hủy</Button>
          <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>Xóa lịch</Button>
        </div>
      </div>
    </Modal>
  );
}
