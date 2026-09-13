import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../server/domain.js";
import { listCareRows } from "../server/care-api.js";
import { customerUsage, catalogUsage } from "../server/admin-domain.js";
import { migrateDirectory } from "../server/shared-directory.js";
import type { RouteSchedule } from "../shared/types.js";
function fixture() {
  const state = emptyState("Test");
  state.catalogs!.routes = ["Tuyến A"];
  state.version = 7;
  state.routeSchedules = Array.from({ length: 30 }, (_, i): RouteSchedule => ({ id: `schedule-${i}`, date: i < 2 ? "2026-09-12" : "2026-09-13", startTime: "08:00", endTime: "09:00", route: "Tuyến A", customerIds: ["customer"], notes: "", status: "planned", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" }));
  return state;
}
test("team schedule API filters before counting/pages and includes concurrency versions", () => {
  const state = fixture();
  state.routeSchedules![0].deletedAt = "2026-09-12T00:00:00Z";
  const owned = [{ ownerId: "employee-a", ownerName: "An", state }, { ownerId: "employee-b", ownerName: "Bình", state: fixture() }];
  const result = listCareRows(owned, "routeSchedules", { ownerId: "employee-a", to: "2026-09-12", q: "tuyen", pageSize: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].workspaceVersion, 7);
  assert.equal(result.items[0].ownerId, "employee-a");
  assert.equal(listCareRows(owned, "routeSchedules", { pageSize: 1000 }).pageSize, 100);
  assert.equal(listCareRows(owned, "routeSchedules", { ownerId: "missing" }).total, 0);
  assert.throws(() => listCareRows(owned, "routeSchedules", { from: "2026-02-30" }), /ngày/);
});
test("references include deleted schedules and historical corrections", () => {
  const state = fixture();
  state.routeSchedules![0].deletedAt = "2026-09-12T00:00:00Z";
  state.routeSchedules![0].resultHistory = [{ id: "correction", at: "2026-09-12T00:00:00Z", reason: "Sửa khách", before: { completedCustomerIds: ["past-customer"], resultNotes: "", performedDate: "2026-09-12" }, after: { completedCustomerIds: [], resultNotes: "", performedDate: "2026-09-12" } }];
  const owned = [{ ownerId: "employee-a", ownerName: "An", state }];
  assert.equal(customerUsage(owned, "past-customer").schedules, 1);
  assert.equal(customerUsage(owned, "customer").schedules, 30);
  assert.equal(catalogUsage(owned, [], [], "routes", "Tuyến A"), 30);
});
test("shared directory migration preserves route and visit identity through remapping", () => {
  const state = fixture();
  state.customers.push({ id: "customer", name: "Khách", contact: "", phone: "", email: "", address: "", street: "", ward: "", district: "", province: "", route: "Tuyến A", visitDays: [], frequency: "", storeType: "", notes: "", openedDate: "2026-09-10" });
  state.visits = [{ id: "visit", customerId: "customer", date: "2026-09-12", notes: "", scheduleId: "schedule-0" }];
  state.routeSchedules![0].completedCustomerIds = ["customer"];
  state.routeSchedules![0].resultHistory = [{ id: "revision", at: "2026-09-12T00:00:00Z", reason: "test", before: { completedCustomerIds: [], resultNotes: "", performedDate: "2026-09-12" }, after: { completedCustomerIds: ["customer"], resultNotes: "", performedDate: "2026-09-12" } }];
  const next = migrateDirectory([{ owner: "owner", state }]).states[0].state;
  assert.deepEqual(next.routeSchedules![0].customerIds, ["owner:customer"]);
  assert.deepEqual(next.routeSchedules![0].completedCustomerIds, ["owner:customer"]);
  assert.deepEqual(next.routeSchedules![0].resultHistory![0].after.completedCustomerIds, ["owner:customer"]);
  assert.equal(next.visits[0].customerId, "owner:customer");
  assert.equal(next.visits[0].scheduleId, "schedule-0");
});
