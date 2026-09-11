import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute } from "../server/domain.js";
import {
  customerUsage,
  dashboardOf,
  duplicateCustomers,
  pageOf,
} from "../server/admin-domain.js";
import type { AppState } from "../shared/types.js";

const command = (
  state: AppState,
  type: string,
  payload: Record<string, unknown>,
  role: "admin" | "employee" = "admin",
) =>
  execute(
    state,
    {
      type,
      payload,
      idempotencyKey: crypto.randomUUID(),
      version: state.version,
    },
    { id: role === "admin" ? "admin-id" : "employee-id", role },
  );

test("admin đưa khách vào thùng rác, khôi phục và chỉ purge khách không có lịch sử", () => {
  let state = emptyState();
  state = command(state, "saveCustomer", { name: "Khách không dùng" });
  const customerId = state.customers[0].id;
  state = command(state, "deleteCustomer", { id: customerId, reason: "Dọn khách thử" });
  assert.ok(state.customers[0].deletedAt);
  assert.equal(state.customers[0].archived, true);
  state = command(state, "restoreCustomer", { id: customerId, reason: "Khôi phục thử" });
  assert.equal(state.customers[0].deletedAt, undefined);
  assert.equal(state.customers[0].archived, false);
  state = command(state, "deleteCustomer", { id: customerId, reason: "Xoá lần cuối" });
  state = command(state, "purgeCustomer", { id: customerId, reason: "Không còn tham chiếu" });
  assert.equal(state.customers.length, 0);
});

test("nhân viên không thể xóa khách và mã sản phẩm đang kinh doanh không được trùng", () => {
  let state = emptyState();
  state = command(state, "saveCustomer", { name: "Khách mẫu" });
  assert.throws(
    () => command(state, "deleteCustomer", { id: state.customers[0].id, reason: "Không có quyền" }, "employee"),
    /quản trị viên|admin/i,
  );
  state = command(state, "saveProduct", { name: "Sản phẩm A", code: "TC-01", pack: 1 });
  assert.throws(
    () => command(state, "saveProduct", { name: "Sản phẩm B", code: "tc-01", pack: 1 }),
    /Mã sản phẩm/,
  );
});

test("thống kê admin phát hiện khách trùng, quỹ âm, toa giao dở và phân trang", () => {
  const state = emptyState();
  state.customers = [
    { id: "c1", name: "Tạp Hóa Mai", phone: "090 123 4567", contact: "", email: "", address: "A", street: "", ward: "", district: "", province: "", route: "", visitDays: [], frequency: "", storeType: "", notes: "", openedDate: "2026-09-01" },
    { id: "c2", name: "Cửa hàng khác", phone: "0901234567", contact: "", email: "", address: "B", street: "", ward: "", district: "", province: "", route: "", visitDays: [], frequency: "", storeType: "", notes: "", openedDate: "2026-09-01" },
  ];
  state.summary.available = "-1";
  state.orders.push({ id: "o1", code: "TC-1", customerId: "c1", date: "2026-09-01", notes: "", status: "partial", lines: [], total: "0", margin: "0", reserved: "0", version: 1 });
  const owned = [{ ownerId: "u1", ownerName: "Nhân viên", state }];
  assert.equal(duplicateCustomers(state.customers).length, 1);
  assert.equal(customerUsage(owned, "c1").orders, 1);
  const dashboard = dashboardOf(owned, []);
  assert.equal(dashboard.partialOrders, 1);
  assert.equal(dashboard.negativeFunds, 1);
  assert.deepEqual(pageOf([1, 2, 3], 2, 2).items, [3]);
});

test("đổi tên danh mục cập nhật khách đang tham chiếu và nhân viên không thể thực hiện", () => {
  let state = emptyState();
  state = command(state, "saveCustomer", {
    name: "Khách Càng Long",
    district: "Càng Long",
  });
  state = command(state, "renameCatalog", {
    kind: "districts",
    oldValue: "Càng Long",
    newValue: "Càng Long mới",
    reason: "Chuẩn hóa địa bàn",
  });
  assert.ok(state.catalogs?.districts.includes("Càng Long mới"));
  assert.equal(state.customers[0].district, "Càng Long mới");
  assert.throws(
    () => command(state, "renameCatalog", {
      kind: "districts",
      oldValue: "Càng Long mới",
      newValue: "Càng Long",
      reason: "Không có quyền",
    }, "employee"),
    /quản trị viên|admin/i,
  );
});

test("không xóa vĩnh viễn khách hàng còn lịch sử toa", () => {
  let state = emptyState();
  state = command(state, "saveCustomer", { name: "Khách có toa" });
  const customerId = state.customers[0].id;
  state.orders.push({
    id: "order-history",
    code: "TC-HISTORY",
    customerId,
    date: "2026-09-01",
    notes: "",
    status: "draft",
    lines: [],
    total: "0",
    margin: "0",
    reserved: "0",
    version: 1,
  });
  state = command(state, "deleteCustomer", { id: customerId, reason: "Dọn dữ liệu" });
  assert.throws(
    () => command(state, "purgeCustomer", { id: customerId, reason: "Xóa hoàn toàn" }),
    /còn lịch sử/i,
  );
});
