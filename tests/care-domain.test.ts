import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, DomainError } from "../server/domain.js";
import { executeCareCommand, markCareReviewNeeded, type CareActor } from "../server/care-domain.js";
import { businessDate, validateDate } from "../shared/business-date.js";
import type { AppState } from "../shared/types.js";
const actor: CareActor = { id: "employee-a", role: "employee", now: "2026-09-13T01:00:00.000Z" };
const admin: CareActor = { ...actor, id: "admin", role: "admin" };
function run(state: AppState, type: string, payload: unknown, by = actor) {
  const next = structuredClone(state);
  assert.equal(executeCareCommand(next, { type, payload, idempotencyKey: crypto.randomUUID() }, by), true);
  return next;
}
function fixture() {
  const s = emptyState("Test");
  s.catalogs!.routes = ["A", "B"];
  s.catalogEntries = [{ id: "route-a", kind: "routes", value: "A", active: true, position: 0 }];
  s.customers = ["c1", "c2", "c3"].map((id, i) => ({ id, name: id, contact: "", phone: "", email: "", address: "", street: "", ward: "", district: "", province: "", route: i === 2 ? "B" : "A", visitDays: [], frequency: "", storeType: "", notes: "", openedDate: "2026-01-01" }));
  return s;
}
const schedule = { date: "2026-09-12", startTime: "08:00", endTime: "09:00", routeId: "route-a", customerIds: ["c1", "c2"] };
test("business day rolls over at Vietnam midnight and validates real calendar dates", () => {
  assert.equal(businessDate("2026-09-12T16:59:59Z"), "2026-09-12");
  assert.equal(businessDate("2026-09-12T17:00:00Z"), "2026-09-13");
  assert.equal(validateDate("2026-02-29"), false);
  assert.equal(validateDate("2028-02-29"), true);
});
test("attendance rejects future, invalid enum and historical employee writes; repeated check-in is stable", () => {
  const s = fixture();
  assert.throws(() => run(s, "setAttendance", { date: "2026-09-14", status: "worked" }), /tương lai/);
  assert.throws(() => run(s, "setAttendance", { status: "bad" }), /Trạng thái/);
  assert.throws(() => run(s, "setAttendance", { date: "2026-09-12", status: "worked" }), /Ngày cũ/);
  const checked = run(s, "setAttendance", { status: "worked" });
  const repeated = run(checked, "setAttendance", { status: "worked" });
  assert.deepEqual(repeated, checked);
  assert.throws(() => run(checked, "setAttendance", { status: "leave" }), /lý do/);
  const leave = run(checked, "setAttendance", { status: "leave", reason: "Nghỉ phép" });
  assert.equal(leave.attendanceHistory?.length, 2);
  assert.equal(leave.attendanceHistory?.[1].before?.status, "worked");
});
test("past attendance requests are pending until one admin approves the unchanged version", () => {
  let s = run(fixture(), "requestAttendance", { date: "2026-09-12", status: "worked", reason: "Quên điểm danh" });
  const id = s.attendanceRequests![0].id;
  assert.equal(s.attendance?.length ?? 0, 0);
  assert.throws(() => run(s, "requestAttendance", { date: "2026-09-12", status: "leave", reason: "Nghỉ phép" }), /chờ duyệt/);
  const review = { id, decision: "approved", reason: "Đã đối chiếu", requestVersion: 1 };
  assert.throws(() => run(s, "reviewAttendanceRequest", review), /quản trị/);
  assert.throws(() => run(s, "reviewAttendanceRequest", { ...review, requestVersion: 0 }, admin), /thay đổi/);
  const conflicted = run(s, "setAttendance", { date: "2026-09-12", status: "leave", reason: "Quản trị sửa" }, admin);
  assert.throws(() => run(conflicted, "reviewAttendanceRequest", review, admin), /đối chiếu/);
  s = run(s, "reviewAttendanceRequest", review, admin);
  assert.equal(s.attendance![0].status, "worked");
  assert.throws(() => run(s, "reviewAttendanceRequest", review, admin), /đã được xử lý/);
});
test("attendance request withdrawal checks creator and does not alter day totals", () => {
  let s = run(fixture(), "requestAttendance", { date: "2026-09-12", status: "worked", reason: "Quên điểm danh" });
  const p = { id: s.attendanceRequests![0].id, reason: "Không cần nữa" };
  assert.throws(() => run(s, "withdrawAttendanceRequest", p, { ...actor, id: "employee-b" }), /người gửi/);
  s = run(s, "withdrawAttendanceRequest", p);
  assert.equal(s.attendanceRequests![0].status, "withdrawn");
  assert.equal(s.attendance?.length ?? 0, 0);
});
test("route creation checks route, active customer membership and missing edit ID", () => {
  const s = fixture();
  assert.throws(() => run(s, "saveRouteSchedule", { ...schedule, id: "missing" }), (error: unknown) => error instanceof DomainError && error.code === "NOT_FOUND");
  assert.throws(() => run(s, "saveRouteSchedule", { ...schedule, customerIds: ["c3"] }), /không thuộc tuyến/);
  s.customers[0].archived = true;
  assert.throws(() => run(s, "saveRouteSchedule", schedule), /không còn hoạt động/);
  s.customers[0].archived = false;
  s.catalogEntries![0].active = false;
  assert.throws(() => run(s, "saveRouteSchedule", schedule), /ngừng hoạt động/);
});
test("completion uses actual date, retries do not duplicate and corrections retain before/after history", () => {
  let s = run(fixture(), "saveRouteSchedule", schedule);
  const id = s.routeSchedules![0].id;
  const p = { id, completedCustomerIds: ["c1"], resultNotes: "Đã gặp" };
  s = run(s, "completeRouteSchedule", p);
  assert.equal(s.visits[0].date, "2026-09-13");
  assert.equal(s.visits[0].scheduleId, id);
  assert.deepEqual(run(s, "completeRouteSchedule", p), s);
  assert.throws(() => run(s, "saveRouteSchedule", { ...schedule, id }), /Điều chỉnh/);
  assert.throws(() => run(s, "completeRouteSchedule", { ...p, completedCustomerIds: ["c2"] }), /Điều chỉnh/);
  s = run(s, "adjustRouteSchedule", { id, completedCustomerIds: ["c2"], resultNotes: "Đã sửa", performedDate: "2026-09-12", reason: "Chọn nhầm khách" });
  assert.equal(s.visits.filter(v => !v.voidedAt).length, 1);
  assert.equal(s.visits.filter(v => !v.voidedAt)[0].customerId, "c2");
  assert.equal(s.visits.filter(v => !v.voidedAt)[0].date, "2026-09-12");
  assert.equal(s.visits.length, 2);
  assert.deepEqual(s.routeSchedules![0].resultHistory![1].before.completedCustomerIds, ["c1"]);
  s = run(s, "deleteRouteSchedule", { id, reason: "Ẩn khỏi lịch" });
  assert.equal(s.visits.filter(v => !v.voidedAt).length, 1);
});
test("legacy completion is flagged for review without guessing visit links", () => {
  let s = run(fixture(), "saveRouteSchedule", schedule);
  const item = s.routeSchedules![0];
  item.status = "completed";
  item.completedCustomerIds = ["c1"];
  s.visits.push({ id: "legacy", customerId: "c1", date: item.date, notes: "" });
  markCareReviewNeeded(s);
  assert.equal(item.needsReview, true);
  assert.throws(() => run(s, "adjustRouteSchedule", { id: item.id, completedCustomerIds: [], reason: "Cần sửa" }), (error: unknown) => error instanceof DomainError && error.code === "RECONCILIATION_REQUIRED");
  assert.equal(s.visits[0].scheduleId, undefined);
});
test("read review flags preserve anomalous attendance and resolve only exact legacy route IDs", () => {
  const s = fixture();
  s.attendance = [{ date: "2026-09-14", status: "worked", updatedAt: actor.now! }];
  const base = { ...schedule, id: "old", route: "A", routeId: undefined, status: "planned" as const, notes: "", createdAt: actor.now!, updatedAt: actor.now! };
  s.routeSchedules = [base, { ...base, id: "renamed-unlinked", route: "Old route" }];
  markCareReviewNeeded(s, actor.now);
  assert.equal(s.attendance[0].needsReview, true);
  assert.equal(s.attendance[0].date, "2026-09-14");
  assert.equal(s.routeSchedules[0].routeId, "route-a");
  assert.equal(s.routeSchedules[1].routeId, undefined);
  assert.equal(s.routeSchedules[1].needsReview, true);
});
test("cross-workspace mutations require an admin and automatically audit an omitted admin reason", () => {
  const s = fixture();
  assert.throws(() => run(s, "saveRouteSchedule", schedule, { ...actor, workspaceOwnerId: "employee-b" }), /nhân viên khác/);
  const updated = run(s, "saveRouteSchedule", schedule, { ...admin, workspaceOwnerId: "employee-b" });
  assert.equal(updated.routeSchedules!.length, 1);
  assert.match(updated.audit.at(-1)!.details, /Cập nhật bởi quản trị viên/);
});
