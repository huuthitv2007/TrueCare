import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { RouteSchedule, TeamMember } from "../../shared/types";
import { request, useWorkspace } from "../api";
import { Check, Pencil, Plus, Trash2 } from "../icons";
import { Badge, Button, Card, Empty, Field, Heading, Modal, Notice, day, today } from "../ui";
import "../styles/care.css";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => { const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days); return iso(value); };
const startWeek = (date: string) => { const value = new Date(date + "T12:00:00Z"); return addDays(date, 1 - (value.getUTCDay() || 7)); };
const label = (status: RouteSchedule["status"]) => status === "completed" ? "Đã thực hiện" : status === "cancelled" ? "Đã hủy" : "Đã lên lịch";
type TeamRow = RouteSchedule & { ownerId: string; ownerName: string; workspaceVersion: number };
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác. Vui lòng thử lại.";

export function RouteSchedulePage() {
  const { state, user, adminTarget, setAdminTarget } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const view = ["day", "week", "month"].includes(params.get("mode") || "") ? params.get("mode")! : "day";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") && Number.isFinite(Date.parse(params.get("date")!)) ? params.get("date")! : today();
  const route = params.get("route") || "", status = params.get("status") || "", owner = params.get("owner") || "";
  const team = user.role === "admin" && params.get("scope") === "team";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filter = (values: Record<string, string>) => setParams(current => { const next = new URLSearchParams(current); next.delete("page"); for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); } return next; });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [result, setResult] = useState<PageResult<TeamRow> | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState<{ action: "save" | "complete" | "adjust" | "delete"; schedule: RouteSchedule | null } | null>(null);
  const range = useMemo(() => {
    if (view === "week") { const from = startWeek(date); return { from, to: addDays(from, 6) }; }
    if (view === "month") { const [year, month] = date.split("-").map(Number); return { from: date.slice(0, 7) + "-01", to: iso(new Date(Date.UTC(year, month, 0, 12))) }; }
    return { from: date, to: date };
  }, [view, date]);
  useEffect(() => {
    if (!team) return;
    let current = true;
    setError(""); setResult(null);
    const query = new URLSearchParams({ ...range, ownerId: owner, route, status: status || "all", page: String(page), pageSize: "25" });
    Promise.all([request<PageResult<TeamRow>>(`/api/admin/route-schedules?${query}`), request<{ members: TeamMember[] }>("/api/admin/team")])
      .then(([data, people]) => { if (current) { setResult(data); setMembers(people.members); } })
      .catch(failure => { if (current) setError(errorMessage(failure)); });
    return () => { current = false; };
  }, [team, range, owner, route, status, page, reload, state.version]);
  const routes = [...new Set([...(state.catalogs?.routes || []), ...(state.routeSchedules || []).map(item => item.route)])];
  const rows: (RouteSchedule | TeamRow)[] = team ? result?.items || [] : (state.routeSchedules || []).filter(item => !item.deletedAt && item.date >= range.from && item.date <= range.to && (!route || item.route === route) && (!status || item.status === status)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const days = useMemo(() => { const all: string[] = []; for (let value = range.from; value <= range.to; value = addDays(value, 1)) all.push(value); return all; }, [range]);
  const openOwner = (item: TeamRow) => { const member = members.find(value => value.id === item.ownerId); if (!member) { setError("Không tìm thấy tài khoản để mở lịch."); return; } setAdminTarget(member); filter({ scope: "personal", date: item.date, mode: "day", owner: "", route: "", status: "" }); };
  return <>
    <Heading eyebrow="TUYẾN CHĂM SÓC" title="Lịch Theo Tuyến" description={adminTarget && !team ? `Lịch của ${adminTarget.displayName}. Mọi điều chỉnh cần lý do quản trị.` : "Lên lịch, chăm sóc khách và theo dõi kết quả thực tế theo tuyến."} actions={!team && <Button variant="primary" onClick={() => setModal({ action: "save", schedule: null })}><Plus size={17} />Tạo lịch</Button>} />
    <Card><div className="toolbar care-filters">
      {user.role === "admin" && <Field label="Phạm vi"><select value={team ? "team" : "personal"} onChange={event => filter({ scope: event.target.value })}><option value="personal">{adminTarget ? `Cá nhân: ${adminTarget.displayName}` : "Cá nhân"}</option><option value="team">Toàn đội</option></select></Field>}
      <Field label="Mốc ngày"><input type="date" value={date} onChange={event => filter({ date: event.target.value })} /></Field>
      <div className="segmented" aria-label="Kiểu xem lịch">{[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"]].map(([value, text]) => <button key={value} className={view === value ? "active" : ""} aria-pressed={view === value} onClick={() => filter({ mode: value })}>{text}</button>)}</div>
      <Field label="Tuyến"><select value={route} onChange={event => filter({ route: event.target.value })}><option value="">Tất cả tuyến</option>{routes.map(value => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Trạng thái"><select value={status} onChange={event => filter({ status: event.target.value })}><option value="">Tất cả trạng thái</option>{(["planned", "completed", "cancelled"] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
      {team && <Field label="Nhân viên"><select value={owner} onChange={event => filter({ owner: event.target.value })}><option value="">Tất cả nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></Field>}
    </div><div className="toolbar"><Button onClick={() => filter({ date: addDays(range.from, -1) })}>Trước</Button><Button onClick={() => filter({ date: today() })}>Hôm nay</Button><Button onClick={() => filter({ date: addDays(range.to, 1) })}>Sau</Button><Badge>{team ? result?.total || 0 : rows.length} lịch</Badge></div></Card>
    {error && <Notice type="error">{error}<Button onClick={() => setReload(value => value + 1)}>Thử lại</Button></Notice>}
    {team && !result && !error ? <Notice>Đang tải lịch toàn đội…</Notice> : <Card title={`Lịch từ ${day(range.from)} đến ${day(range.to)}`}>
      {!rows.length && <Empty title="Chưa có lịch theo tuyến" description="Tạo lịch mới hoặc đổi bộ lọc để xem lịch đã lên." />}
      <div className={`care-calendar care-calendar-${view}`}>
        {days.map((value, index) => <section key={value} style={view === "month" && index === 0 ? { gridColumnStart: new Date(value + "T12:00:00Z").getUTCDay() || 7 } : undefined} className={`care-calendar-day ${value === today() ? "is-today" : ""} ${rows.some(item => item.date === value) ? "has-schedules" : ""}`} aria-label={day(value)}>
          <h3><time dateTime={value}>{new Date(value + "T12:00:00Z").toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}</time></h3>
          {rows.filter(item => item.date === value).map(item => <article className="care-schedule" key={"ownerId" in item ? item.ownerId + item.id : item.id}>
            <strong>{item.startTime}–{item.endTime}</strong><p>{item.route}</p><Badge>{label(item.status)}</Badge><small>{item.customerIds.length} khách{ "ownerName" in item ? ` · ${item.ownerName}` : ""}</small>
            {item.notes && <p>{item.notes}</p>}
            {!team && <div className="route-customer-chips">{item.customerIds.map(id => <span key={id}>{state.customers.find(customer => customer.id === id)?.name || "Khách đã lưu trữ"}</span>)}</div>}
            {item.resultNotes && <Notice>{item.resultNotes}</Notice>}
            {item.performedDate && <small>Thực hiện: {day(item.performedDate)}</small>}
            {item.needsReview && <Notice type="warning">Kết quả cũ cần đối chiếu trước khi điều chỉnh.</Notice>}
            <div className="heading-actions">{team && "ownerId" in item ? <Button onClick={() => openOwner(item)}>Mở lịch nhân viên</Button> : <>
              {item.status === "planned" && <><Button onClick={() => setModal({ action: "save", schedule: item })}><Pencil size={14} />Sửa</Button><Button onClick={() => setModal({ action: "complete", schedule: item })}><Check size={14} />Đã thực hiện</Button></>}
              {item.status === "completed" && <Button onClick={() => setModal({ action: "adjust", schedule: item })}>Điều chỉnh kết quả</Button>}
              <Button variant="danger" onClick={() => setModal({ action: "delete", schedule: item })}><Trash2 size={14} />Xóa</Button>
            </>}</div>
          </article>)}
        </section>)}
      </div>
      {team && result && result.pages > 1 && <><Notice>Lịch đang hiển thị các mục thuộc trang {page}. Chuyển trang hoặc lọc nhân viên/ngày để xem các lịch còn lại.</Notice><div className="toolbar"><Button disabled={page <= 1} onClick={() => filter({ page: String(page - 1) })}>Trang trước</Button><span>Trang {page}/{result.pages} · {result.total} lịch</span><Button disabled={page >= result.pages} onClick={() => filter({ page: String(page + 1) })}>Trang sau</Button></div></>}
    </Card>}
    {modal && <ScheduleModal key={modal.action + (modal.schedule?.id || "new")} {...modal} initialDate={date} onClose={() => setModal(null)} />}
  </>;
}

function ScheduleModal({ action, schedule, initialDate, onClose }: { action: "save" | "complete" | "adjust" | "delete"; schedule: RouteSchedule | null; initialDate: string; onClose: () => void }) {
  const { state, user, command, busy, notify } = useWorkspace();
  const routes = state.catalogs?.routes || [];
  const [route, setRoute] = useState(schedule?.route || routes[0] || "");
  const [date, setDate] = useState(schedule?.date || initialDate);
  const [startTime, setStart] = useState(schedule?.startTime || "08:00"), [endTime, setEnd] = useState(schedule?.endTime || "11:00");
  const active = state.customers.filter(customer => !customer.archived && !customer.deletedAt && !customer.mergedInto && customer.route === route);
  const [selected, setSelected] = useState(() => new Set(action === "save" ? schedule?.customerIds || active.map(customer => customer.id) : schedule?.completedCustomerIds || schedule?.customerIds || []));
  const [search, setSearch] = useState(""), [reason, setReason] = useState(""), [error, setError] = useState("");
  const result = action === "complete" || action === "adjust";
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const lastVisit = (id: string) => state.visits.filter(visit => visit.customerId === id && !visit.voidedAt).map(visit => visit.date).sort().at(-1);
  const suggested = active.filter(customer => customer.visitDays.includes(weekday) || !lastVisit(customer.id));
  const visible = active.filter(customer => `${customer.name} ${customer.phone} ${customer.address}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi"))).sort((a, b) => (lastVisit(a.id) || "").localeCompare(lastVisit(b.id) || ""));
  const overlap = (state.routeSchedules || []).filter(item => item.id !== schedule?.id && !item.deletedAt && item.status !== "cancelled" && item.date === date && item.startTime < endTime && item.endTime > startTime);
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = action === "save" ? { id: schedule?.id, scheduleVersion: schedule?.version, date, startTime, endTime, route, routeId: state.catalogEntries?.find(entry => entry.kind === "routes" && entry.active && entry.value === route)?.id, customerIds: [...selected], notes: form.get("notes") } : { id: schedule?.id, scheduleVersion: schedule?.version, completedCustomerIds: [...selected], performedDate: form.get("performedDate"), resultNotes: form.get("resultNotes"), reason };
      await command(action === "save" ? "saveRouteSchedule" : action === "delete" ? "deleteRouteSchedule" : action === "adjust" ? "adjustRouteSchedule" : "completeRouteSchedule", payload);
      notify(action === "save" ? "Đã lưu lịch theo tuyến." : action === "delete" ? "Đã ẩn lịch; giữ nguyên lịch sử chăm sóc." : "Đã lưu kết quả chăm sóc."); onClose();
    } catch (failure) { setError(errorMessage(failure)); }
  };
  const title = action === "save" ? schedule ? "Sửa lịch theo tuyến" : "Tạo lịch theo tuyến" : action === "delete" ? "Xóa lịch theo tuyến" : action === "adjust" ? "Điều chỉnh kết quả" : "Hoàn thành lịch theo tuyến";
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }} wide><form className="form-stack" onSubmit={save}>
    {error && <Notice type="error">{error}</Notice>}
    {action === "save" && <><div className="form-grid"><Field label="Ngày thực hiện"><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></Field><Field label="Bắt đầu"><input type="time" value={startTime} onChange={event => setStart(event.target.value)} required /></Field><Field label="Kết thúc"><input type="time" value={endTime} onChange={event => setEnd(event.target.value)} required /></Field><Field label="Tuyến"><select required value={route} onChange={event => { setRoute(event.target.value); setSelected(new Set()); }}><option value="">Chọn tuyến</option>{routes.map(value => <option key={value}>{value}</option>)}</select></Field></div>
      {overlap.length > 0 && <Notice type="warning">Khung giờ trùng {overlap.length} lịch khác trong ngày. Hãy đối chiếu trước khi lưu.</Notice>}
      <Field label="Ghi chú"><textarea name="notes" defaultValue={schedule?.notes} /></Field>
      <Card title="Khách hàng trong tuyến" subtitle="Ưu tiên khách đến ngày ghé và khách chưa từng chăm sóc. Xác nhận danh sách trước khi lưu.">
        <Field label="Tìm khách"><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <div className="toolbar"><Button type="button" onClick={() => setSelected(new Set(active.map(customer => customer.id)))}>Chọn tất cả</Button><Button type="button" onClick={() => setSelected(new Set(suggested.map(customer => customer.id)))}>Chọn gợi ý ({suggested.length})</Button><Button type="button" onClick={() => setSelected(new Set())}>Bỏ chọn</Button><Badge>{selected.size} khách</Badge></div>
        <div className="route-customer-picker">{visible.map(customer => <label className="checkbox-row" key={customer.id}><input type="checkbox" checked={selected.has(customer.id)} onChange={() => toggle(customer.id)} /><span><strong>{customer.name}</strong><small>{customer.address || customer.phone} · {lastVisit(customer.id) ? `Chăm sóc gần nhất: ${day(lastVisit(customer.id)!)}` : "Chưa chăm sóc"}{customer.visitDays.includes(weekday) ? " · Đến ngày ghé" : ""}</small></span></label>)}</div>
        {(schedule?.customerIds || []).filter(id => selected.has(id) && !active.some(customer => customer.id === id)).map(id => <label className="checkbox-row" key={id}><input type="checkbox" checked onChange={() => toggle(id)} /><span>{state.customers.find(customer => customer.id === id)?.name || "Khách đã lưu trữ"}<small>Khách không còn hoạt động trong tuyến này. Bỏ chọn để lưu lịch.</small></span></label>)}
        {!active.length && <Empty title="Tuyến chưa có khách hàng" description="Có thể lưu lịch ghi chú và bổ sung khách sau." />}
        {active.length > 0 && !visible.length && <Notice>Không tìm thấy khách phù hợp.</Notice>}
      </Card></>}
    {result && <><Notice>Chọn khách đã chăm sóc thực tế. Báo cáo dùng ngày thực hiện và kết quả mới nhất. Điều chỉnh giữ lại lịch sử trước/sau.</Notice><Field label="Ngày chăm sóc thực tế"><input name="performedDate" type="date" max={today()} defaultValue={schedule?.performedDate || (schedule && schedule.date <= today() ? schedule.date : today())} required /></Field>
      <div className="route-customer-picker">{(schedule?.customerIds || []).map(id => <label className="checkbox-row" key={id}><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} /><span>{state.customers.find(customer => customer.id === id)?.name || "Khách đã lưu trữ"}</span></label>)}</div>
      <Field label="Ghi chú kết quả"><textarea name="resultNotes" defaultValue={schedule?.resultNotes} /></Field></>}
    {action === "delete" && <Notice type="warning">Ẩn lịch {day(schedule!.date)} tuyến {schedule!.route}. Lượt chăm sóc đã ghi và báo cáo vẫn được giữ nguyên.</Notice>}
    {(action === "delete" || action === "adjust") && user.role !== "admin" && <Field label="Lý do"><textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} required /></Field>}
    <div className="modal-actions"><Button type="button" disabled={busy} onClick={onClose}>Hủy</Button><Button variant={action === "delete" ? "danger" : "primary"} busy={busy} disabled={user.role !== "admin" && (action === "delete" || action === "adjust") && reason.trim().length < 3}>{action === "save" ? "Lưu lịch" : action === "delete" ? "Ẩn lịch" : "Lưu kết quả"}</Button></div>
  </form></Modal>;
}
