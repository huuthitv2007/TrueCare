import { randomUUID } from "node:crypto";
import type { AppState, AttendanceRecord, AttendanceStatus, Command, RouteSchedule, RouteScheduleResult } from "../shared/types.js";
import { businessDate, validateDate } from "../shared/business-date.js";
import { assert, DomainError } from "./domain.js";
import type { Actor } from "./order-lifecycle.js";

export type CareActor = Actor & { workspaceOwnerId?: string };
const careTypes = new Set(["setAttendance", "requestAttendance", "withdrawAttendanceRequest", "reviewAttendanceRequest", "saveRouteSchedule", "deleteRouteSchedule", "completeRouteSchedule", "adjustRouteSchedule"]);
const statuses = new Set(["worked", "cancelled", "leave"]);
function day(value: unknown): string {
  assert(validateDate(value), "Ngày không hợp lệ");
  return value;
}
function status(value: unknown): AttendanceStatus {
  assert(typeof value === "string" && statuses.has(value), "Trạng thái điểm danh không hợp lệ");
  return value as AttendanceStatus;
}
function attendanceFingerprint(value?: AttendanceRecord) {
  return value ? JSON.stringify([value.date, value.status, value.version ?? 0, value.updatedAt, value.checkedInAt, value.changedBy, value.reason]) : "absent";
}
const ADMIN_REASON = "Cập nhật bởi quản trị viên";
function reason(value: unknown, allowAutomatic = false): string {
  const result = String(value ?? "").trim();
  if (!result && allowAutomatic) return ADMIN_REASON;
  assert(result.length >= 3, "Nhập lý do từ 3 ký tự");
  return result;
}
function find<T extends { id: string }>(items: T[], value: unknown): T {
  const result = items.find(item => item.id === value);
  if (!result) throw new DomainError("NOT_FOUND", "Không tìm thấy bản ghi", 404);
  return result;
}
function ids(value: unknown): string[] {
  assert(Array.isArray(value) && value.every(item => typeof item === "string"), "Danh sách khách hàng không hợp lệ");
  return [...new Set(value as string[])];
}
function snapshot(item: RouteSchedule): RouteScheduleResult {
  return { completedCustomerIds: [...(item.completedCustomerIds ?? [])], resultNotes: item.resultNotes ?? "", performedDate: item.performedDate ?? item.date };
}
function activeCustomer(s: AppState, id: string) {
  const customer = find(s.customers, id);
  assert(!customer.archived && !customer.deletedAt && !customer.mergedInto, "Khách hàng không còn hoạt động", "CONFLICT");
  return customer;
}

/** Safe read projection: flags legacy ambiguity without inferring or rewriting visits. */
export function markCareReviewNeeded(s: AppState, now?: string): void {
  const today = businessDate(now);
  for (const attendance of s.attendance ?? []) {
    if (!validateDate(attendance.date) || attendance.date > today || !statuses.has(attendance.status)) attendance.needsReview = true;
  }
  for (const schedule of s.routeSchedules ?? []) {
    if (schedule.status === "completed" && (schedule.completedCustomerIds?.length ?? 0) > 0 && !s.visits.some(visit => visit.scheduleId === schedule.id)) schedule.needsReview = true;
    if (!schedule.routeId) {
      const matches = s.catalogEntries?.filter(entry => entry.kind === "routes" && entry.value === schedule.route) ?? [];
      if (matches.length === 1) schedule.routeId = matches[0].id;
      else schedule.needsReview = true;
    }
  }
}

/** Runs only on the clone owned by execute(); its caller owns version/idempotency/commit. */
export function executeCareCommand(s: AppState, command: Command, actor?: CareActor): boolean {
  if (!careTypes.has(command.type)) return false;
  const p = command.payload ?? {};
  const now = actor?.now ?? new Date().toISOString();
  const today = businessDate(now);
  const actionReason = (value: unknown) => reason(value, actor?.role === "admin");
  const log = (referenceId: string, details: string) => s.audit.push({ id: randomUUID(), at: now, type: command.type, referenceId, details: JSON.stringify({ actorId: actor?.id, reason: details }) });
  if (actor?.workspaceOwnerId && actor.workspaceOwnerId !== actor.id) {
    assert(actor.role === "admin", "Không được thay đổi dữ liệu nhân viên khác", "FORBIDDEN");
    actionReason(p.reason);
  }
  const writeAttendance = (date: string, nextStatus: AttendanceStatus, why: string) => {
    s.attendance ??= [];
    const old = s.attendance.find(item => item.date === date);
    const before = old ? structuredClone(old) : undefined;
    const after: AttendanceRecord = { date, status: nextStatus, checkedInAt: nextStatus === "worked" ? old?.checkedInAt ?? now : undefined, updatedAt: now, changedBy: actor?.id, reason: why, version: (old?.version ?? 0) + 1, needsReview: false };
    if (old) Object.assign(old, after); else s.attendance.push(after);
    s.attendance.sort((a, b) => a.date.localeCompare(b.date));
    (s.attendanceHistory ??= []).push({ id: randomUUID(), date, at: now, actorId: actor?.id, reason: why, before, after: structuredClone(after) });
  };
  if (command.type === "setAttendance") {
    const date = day(p.date ?? today);
    const nextStatus = status(p.status);
    assert(date <= today, "Không được điểm danh ngày tương lai");
    assert(date === today || actor?.role === "admin", "Ngày cũ cần gửi yêu cầu để quản trị duyệt", "FORBIDDEN");
    const old = s.attendance?.find(item => item.date === date);
    if (old?.status === nextStatus) return true;
    const why = old || date < today ? actionReason(p.reason) : String(p.reason ?? "Điểm danh hôm nay");
    writeAttendance(date, nextStatus, why);
    log(date, why);
    return true;
  }
  if (command.type === "requestAttendance") {
    assert(actor?.id, "Cần đăng nhập", "FORBIDDEN");
    assert(!actor.workspaceOwnerId || actor.workspaceOwnerId === actor.id, "Chỉ tạo yêu cầu cho bản thân", "FORBIDDEN");
    const date = day(p.date);
    const nextStatus = status(p.status);
    assert(date < today, "Yêu cầu bổ sung chỉ áp dụng cho ngày đã qua");
    const why = actionReason(p.reason);
    const requests = s.attendanceRequests ??= [];
    assert(!requests.some(item => item.date === date && item.status === "pending"), "Ngày này đang có yêu cầu chờ duyệt", "CONFLICT");
    const before = s.attendance?.find(item => item.date === date);
    assert(before?.status !== nextStatus, "Trạng thái điểm danh đã đúng", "CONFLICT");
    const item = { id: randomUUID(), date, requestedStatus: nextStatus, reason: why, status: "pending" as const, requestedBy: actor.id, createdAt: now, updatedAt: now, version: 1, before: before ? structuredClone(before) : undefined };
    requests.push(item);
    log(item.id, why);
    return true;
  }
  if (command.type === "withdrawAttendanceRequest" || command.type === "reviewAttendanceRequest") {
    const request = find(s.attendanceRequests ?? [], p.id);
    assert(request.status === "pending", "Yêu cầu đã được xử lý", "CONFLICT");
    const why = actionReason(p.reason);
    if (command.type === "withdrawAttendanceRequest") {
      assert(actor?.id === request.requestedBy, "Chỉ người gửi được rút yêu cầu", "FORBIDDEN");
      request.status = "withdrawn";
    } else {
      assert(actor?.role === "admin", "Chỉ quản trị được duyệt điểm danh", "FORBIDDEN");
      assert(p.requestVersion === request.version, "Yêu cầu đã thay đổi, vui lòng tải lại", "CONFLICT");
      assert(p.decision === "approved" || p.decision === "rejected", "Quyết định không hợp lệ");
      if (p.decision === "approved") {
        const current = s.attendance?.find(item => item.date === request.date);
        assert(attendanceFingerprint(current) === attendanceFingerprint(request.before), "Điểm danh đã thay đổi từ khi gửi yêu cầu; cần đối chiếu lại", "CONFLICT");
        writeAttendance(request.date, request.requestedStatus, why);
      }
      request.status = p.decision;
      request.reviewedBy = actor.id;
    }
    request.reviewReason = why;
    request.updatedAt = now;
    request.version += 1;
    log(request.id, why);
    return true;
  }
  if (command.type === "saveRouteSchedule") {
    const existing = p.id ? find(s.routeSchedules ?? [], p.id) : undefined;
    if (existing) {
      assert(!existing.deletedAt && existing.status === "planned", "Lịch đã hoàn thành phải dùng Điều chỉnh kết quả", "CONFLICT");
      if (p.scheduleVersion !== undefined) assert(p.scheduleVersion === (existing.version ?? 1), "Lịch đã thay đổi", "CONFLICT");
    }
    const date = day(p.date);
    assert(typeof p.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.startTime), "Giờ bắt đầu không hợp lệ");
    assert(typeof p.endTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.endTime) && p.endTime > p.startTime, "Giờ kết thúc phải sau giờ bắt đầu");
    const entry = p.routeId ? find((s.catalogEntries ?? []).filter(item => item.kind === "routes"), p.routeId) : s.catalogEntries?.find(item => item.kind === "routes" && item.value === p.route);
    const route = entry?.value ?? String(p.route ?? "").trim();
    assert(entry ? entry.active : s.catalogs?.routes.includes(route), "Tuyến không tồn tại hoặc đã ngừng hoạt động", "CONFLICT");
    const customerIds = ids(p.customerIds ?? []);
    for (const id of customerIds) {
      const customer = activeCustomer(s, id);
      assert(customer.routeId && entry ? customer.routeId === entry.id : customer.route === route, "Khách hàng không thuộc tuyến đã chọn", "CONFLICT");
    }
    const fields = { date, startTime: p.startTime, endTime: p.endTime, route, routeId: entry?.id, notes: String(p.notes ?? ""), customerIds, updatedAt: now };
    const scheduleId = existing?.id ?? randomUUID();
    if (existing) Object.assign(existing, fields, { version: (existing.version ?? 1) + 1 });
    else (s.routeSchedules ??= []).push({ ...fields, id: scheduleId, status: "planned", createdAt: now, version: 1 });
    s.routeSchedules!.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    log(scheduleId, actor?.role === "admin" ? actionReason(p.reason) : String(p.reason ?? "Lưu lịch theo tuyến"));
    return true;
  }
  const item = find(s.routeSchedules ?? [], p.id);
  assert(!item.deletedAt, "Lịch đã bị xóa", "CONFLICT");
  if (p.scheduleVersion !== undefined) assert(p.scheduleVersion === (item.version ?? 1), "Lịch đã thay đổi", "CONFLICT");
  if (command.type === "deleteRouteSchedule") {
    const why = actionReason(p.reason);
    Object.assign(item, { deletedAt: now, deletedBy: actor?.id, deleteReason: why, updatedAt: now, version: (item.version ?? 1) + 1 });
    // Completed visits are historical facts; hiding their schedule never voids them.
    if (item.status !== "completed") item.status = "cancelled";
    log(item.id, why);
    return true;
  }
  const adjustment = command.type === "adjustRouteSchedule";
  const why = adjustment ? actionReason(p.reason) : String(p.reason ?? "Hoàn thành lịch theo tuyến");
  const completedCustomerIds = ids(p.completedCustomerIds ?? item.customerIds);
  assert(completedCustomerIds.every(id => item.customerIds.includes(id)), "Khách hoàn thành không nằm trong lịch");
  const resultNotes = String(p.resultNotes ?? "").trim();
  const performedDate = day(p.performedDate ?? today);
  assert(performedDate <= today, "Không ghi kết quả chăm sóc trong tương lai");
  const before = snapshot(item);
  const after = { completedCustomerIds, resultNotes, performedDate };
  if (!adjustment && item.status === "completed") {
    assert(JSON.stringify(before) === JSON.stringify(after), "Dùng Điều chỉnh kết quả để sửa lịch đã hoàn thành", "CONFLICT");
    return true;
  }
  assert(adjustment ? item.status === "completed" : item.status === "planned", "Trạng thái lịch không phù hợp", "CONFLICT");
  if (adjustment && (item.completedCustomerIds?.length ?? 0) > 0 && !s.visits.some(visit => visit.scheduleId === item.id)) {
    // Legacy visits have no reliable schedule link: do not guess from dates or names.
    item.needsReview = true;
    throw new DomainError("RECONCILIATION_REQUIRED", "Lịch cũ chưa liên kết lượt chăm sóc; cần quản trị đối chiếu trước khi sửa", 409);
  }
  for (const id of completedCustomerIds) {
    if (!adjustment || !item.completedCustomerIds?.includes(id)) activeCustomer(s, id);
  }
  for (const visit of s.visits.filter(visit => visit.scheduleId === item.id && !visit.voidedAt)) {
    if (!completedCustomerIds.includes(visit.customerId) || visit.date !== performedDate || visit.notes !== resultNotes) Object.assign(visit, { voidedAt: now, voidedBy: actor?.id, voidReason: why });
  }
  for (const customerId of completedCustomerIds) {
    if (!s.visits.some(visit => visit.scheduleId === item.id && visit.customerId === customerId && !visit.voidedAt)) s.visits.push({ id: randomUUID(), scheduleId: item.id, customerId, date: performedDate, notes: resultNotes });
  }
  (item.resultHistory ??= []).push({ id: randomUUID(), at: now, actorId: actor?.id, reason: why, before, after: structuredClone(after) });
  Object.assign(item, after, { status: "completed", completedAt: item.completedAt ?? now, updatedAt: now, version: (item.version ?? 1) + 1 });
  log(item.id, why);
  return true;
}
