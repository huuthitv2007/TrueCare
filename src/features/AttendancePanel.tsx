import { useEffect, useState, type FormEvent } from "react";
import type { AppState, AttendanceRequest, AttendanceStatus, TeamMember } from "../../shared/types";
import { request, useWorkspace } from "../api";
import { Badge, Button, Card, Empty, Field, Modal, Notice, day, today } from "../ui";
import "../styles/care.css";

const labels: Record<AttendanceStatus, string> = { worked: "Đã làm việc", cancelled: "Không làm việc", leave: "Nghỉ phép" };
const requestLabels: Record<AttendanceRequest["status"], string> = { pending: "Chờ duyệt", approved: "Đã chấp thuận", rejected: "Đã từ chối", withdrawn: "Đã rút" };
type ReviewRow = AttendanceRequest & { ownerId: string; ownerName: string; workspaceVersion: number; sharedVersion?: number; inventoryVersion?: number };
type ReviewPage = { items: ReviewRow[]; total: number; page: number; pages: number; pageSize: number };
const message = (error: unknown) => error instanceof Error ? error.message : "Không thực hiện được thao tác.";

/** Attendance controls use the report date; pending requests do not alter counted days. */
export function AttendancePanel({ date }: { date: string }) {
  const { state, user, command, busy, notify, adminTarget, adminReason, setAdminReason } = useWorkspace();
  const [tab, setTab] = useState("personal");
  const [action, setAction] = useState<"record" | "request" | "withdraw" | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("worked");
  const [reason, setReason] = useState(""), [error, setError] = useState("");
  const record = state.attendance?.find(item => item.date === date);
  const requests = (state.attendanceRequests || []).filter(item => item.date === date);
  const pending = requests.find(item => item.status === "pending");
  const open = (next: typeof action) => { setAction(next); setReason(""); setError(""); setStatus(record?.status || "worked"); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      await command(action === "record" ? "setAttendance" : action === "request" ? "requestAttendance" : "withdrawAttendanceRequest", action === "withdraw" ? { id: pending?.id, reason } : { date, status, reason });
      notify(action === "request" ? "Đã gửi yêu cầu; ngày công chỉ đổi sau khi admin duyệt." : action === "withdraw" ? "Đã rút yêu cầu." : "Đã cập nhật điểm danh."); setAction(null);
    } catch (failure) { setError(message(failure)); }
  };
  return <Card title="Điểm danh và ngày làm việc" subtitle="Ngày làm thực tế chỉ tính ngày đã ghi nhận. Chỉ tiêu kế hoạch được giữ riêng.">
    {user.role === "admin" && <div className="segmented" aria-label="Phạm vi điểm danh"><button className={tab === "personal" ? "active" : ""} onClick={() => setTab("personal")}>Cá nhân</button><button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>Duyệt bổ sung toàn đội</button></div>}
    {tab === "review" && user.role === "admin" ? <AttendanceReview /> : <>
      <div className="toolbar"><strong>{day(date)}</strong><Badge>{record ? labels[record.status] : "Chưa xác nhận"}</Badge>{pending && <Badge>Yêu cầu đang chờ duyệt</Badge>}</div>
      <div className="toolbar">{date === today() && <Button onClick={() => open("record")}>{record ? "Điều chỉnh điểm danh hôm nay" : "Điểm danh hôm nay"}</Button>}{date < today() && !adminTarget && <Button disabled={!!pending} onClick={() => open("request")}>Yêu cầu bổ sung/điều chỉnh</Button>}{pending?.requestedBy === user.id && <Button onClick={() => open("withdraw")}>Rút yêu cầu</Button>}</div>
      {date < today() && adminTarget && <Notice>Nhân viên gửi yêu cầu bổ sung từ tài khoản của mình. Admin xử lý tại Duyệt bổ sung toàn đội.</Notice>}
      {date > today() && <Notice>Không ghi nhận ngày làm việc trong tương lai.</Notice>}
      {requests.map(item => <div className="care-request" key={item.id}><Badge>{requestLabels[item.status]}</Badge><span>{labels[item.requestedStatus]} · {item.reason}</span>{item.reviewReason && <small>Phản hồi: {item.reviewReason}</small>}</div>)}
      {action && <Modal title={action === "record" ? "Điểm danh hôm nay" : action === "request" ? "Yêu cầu bổ sung/điều chỉnh" : "Rút yêu cầu điểm danh"} onClose={() => { if (!busy) setAction(null); }}>
        <form className="form-stack" onSubmit={save}>
          {error && <Notice type="error">{error}</Notice>}
          <Notice>{day(date)} · Hiện tại: {record ? labels[record.status] : "Chưa xác nhận"}{action === "request" ? ". Yêu cầu không cộng ngày công cho đến khi được duyệt." : ""}</Notice>
          {adminTarget && <Field label="Lý do quản trị"><textarea value={adminReason} onChange={event => setAdminReason(event.target.value)} required minLength={3} /></Field>}
          {action !== "withdraw" && <Field label="Trạng thái muốn ghi nhận"><select value={status} onChange={event => setStatus(event.target.value as AttendanceStatus)}>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>}
          <Field label="Lý do"><textarea value={reason} onChange={event => setReason(event.target.value)} required minLength={3} /></Field>
          <div className="modal-actions"><Button type="button" disabled={busy} onClick={() => setAction(null)}>Hủy</Button><Button variant="primary" busy={busy} disabled={reason.trim().length < 3}>{action === "request" ? "Gửi yêu cầu" : action === "withdraw" ? "Rút yêu cầu" : "Ghi nhận"}</Button></div>
        </form>
      </Modal>}
    </>}
  </Card>;
}

function AttendanceReview() {
  const { state, refresh, notify } = useWorkspace();
  const [status, setStatus] = useState("pending"), [owner, setOwner] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ReviewPage | null>(null), [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState(""), [review, setReview] = useState<{ row: ReviewRow; decision: "approved" | "rejected" } | null>(null);
  const [reason, setReason] = useState(""), [saving, setSaving] = useState(false), [modalError, setModalError] = useState("");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let current = true; setError(""); setResult(null);
    const query = new URLSearchParams({ status: status || "all", ownerId: owner, from, to, page: String(page), pageSize: "25" });
    Promise.all([request<ReviewPage>(`/api/admin/attendance-requests?${query}`), request<{ members: TeamMember[] }>("/api/admin/team")]).then(([data, people]) => { if (current) { setResult(data); setMembers(people.members); } }).catch(failure => { if (current) setError(message(failure)); });
    return () => { current = false; };
  }, [status, owner, from, to, page, revision, state.version]);
  const begin = (row: ReviewRow, decision: "approved" | "rejected") => { setReview({ row, decision }); setReason(""); setModalError(""); setOperationKey(crypto.randomUUID()); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!review) return; setSaving(true); setModalError("");
    try {
      await request<AppState>(`/api/admin/workspaces/${review.row.ownerId}/commands`, { reason, command: { type: "reviewAttendanceRequest", payload: { id: review.row.id, decision: review.decision, reason, requestVersion: review.row.version }, version: review.row.workspaceVersion, sharedVersion: review.row.sharedVersion, inventoryVersion: review.row.inventoryVersion, idempotencyKey: operationKey } });
      setReview(null); setRevision(value => value + 1); notify("Đã xử lý yêu cầu điểm danh."); await refresh();
    } catch (failure) { setModalError(message(failure)); } finally { setSaving(false); }
  };
  return <div className="form-stack">
    <div className="toolbar care-filters"><Field label="Trạng thái yêu cầu"><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(requestLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field><Field label="Nhân viên"><select value={owner} onChange={event => { setOwner(event.target.value); setPage(1); }}><option value="">Tất cả nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></Field><Field label="Từ ngày"><input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></Field><Field label="Đến ngày"><input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></Field></div>
    {error && <Notice type="error">{error}<Button onClick={() => setRevision(value => value + 1)}>Thử lại</Button></Notice>}
    {!result && !error && <Notice>Đang tải yêu cầu…</Notice>}
    {result?.items.map(row => <article className="care-request" key={row.ownerId + row.id}><strong>{row.ownerName} · {day(row.date)}</strong><Badge>{requestLabels[row.status]}</Badge><p>{row.before ? labels[row.before.status] : "Chưa xác nhận"} → {labels[row.requestedStatus]}</p><p>{row.reason}</p>{row.reviewReason && <small>Phản hồi: {row.reviewReason}</small>}{row.status === "pending" && <div className="toolbar"><Button variant="primary" onClick={() => begin(row, "approved")}>Chấp thuận</Button><Button onClick={() => begin(row, "rejected")}>Từ chối</Button></div>}</article>)}
    {result && !result.items.length && <Empty title="Không có yêu cầu phù hợp" />}
    {result && result.pages > 1 && <div className="toolbar"><Button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Trang trước</Button><span>Trang {page}/{result.pages} · {result.total} yêu cầu</span><Button disabled={page >= result.pages} onClick={() => setPage(value => value + 1)}>Trang sau</Button></div>}
    {review && <Modal title={review.decision === "approved" ? "Chấp thuận bổ sung điểm danh" : "Từ chối yêu cầu điểm danh"} onClose={() => { if (!saving) setReview(null); }}><form className="form-stack" onSubmit={submit}>{modalError && <Notice type="error">{modalError}</Notice>}<Notice>{review.row.ownerName} · {day(review.row.date)} · {review.row.before ? labels[review.row.before.status] : "Chưa xác nhận"} → {labels[review.row.requestedStatus]}. {review.decision === "approved" ? "Ngày công sẽ được tính lại theo trạng thái mới." : "Ngày công hiện tại không thay đổi."}</Notice><Field label="Lý do duyệt/từ chối"><textarea required minLength={3} value={reason} onChange={event => { setReason(event.target.value); setOperationKey(crypto.randomUUID()); }} /></Field><div className="modal-actions"><Button type="button" disabled={saving} onClick={() => setReview(null)}>Hủy</Button><Button variant="primary" busy={saving} disabled={reason.trim().length < 3}>{review.decision === "approved" ? "Chấp thuận" : "Từ chối"}</Button></div></form></Modal>}
  </div>;
}
