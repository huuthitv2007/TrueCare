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

test("admin cannot reorder weekdays or remove a catalog entry still used by a customer", () => {
 let state=emptyState();
 state=command(state,'saveCustomer',{name:'Khách liên kết',district:'Càng Long'});
 assert.throws(()=>command(state,'saveCatalog',{districts:state.catalogs!.districts.filter(value=>value!=='Càng Long')}),/còn được khách hàng sử dụng/);
 assert.throws(()=>command(state,'saveCatalog',{visitDays:[...state.catalogs!.visitDays].reverse()}),/thứ trong tuần/);
});

test('catalog records retain identity and inactive state across reordering and rename',()=>{
 let state=command(emptyState(),'saveCatalog',{routes:['Tuyến A','Tuyến B'],entryStatus:{routes:{'Tuyến A':false}}});
 const entry=state.catalogEntries!.find(item=>item.value==='Tuyến A')!;
 state=command(state,'saveCatalog',{routes:['Tuyến B','Tuyến A']});
 assert.equal(state.catalogEntries!.find(item=>item.value==='Tuyến A')!.id,entry.id);
 assert.equal(state.catalogEntries!.find(item=>item.value==='Tuyến A')!.active,false);
 state=command(state,'renameCatalog',{kind:'routes',oldValue:'Tuyến A',newValue:'Tuyến C',reason:'Đổi tên tuyến'});
 assert.equal(state.catalogEntries!.find(item=>item.value==='Tuyến C')!.id,entry.id);
 assert.equal(state.catalogEntries!.find(item=>item.value==='Tuyến C')!.active,false);
});

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

test("lưu hồ sơ không thể tạo lại trạng thái lưu trữ khách hàng", () => {
  let current = emptyState();
  current = command(current, "saveCustomer", { name: "Khách đang hoạt động" });
  const customer = current.customers[0];
  current = command(current, "saveCustomer", { customer: { ...customer, archived: true } });
  assert.equal(current.customers[0].archived, false);
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

test("sản phẩm vào thùng rác, khôi phục đúng trạng thái và chỉ purge khi không còn lịch sử", () => {
  let state = emptyState();
  state = command(state, "saveProduct", {
    name: "Sản phẩm chưa dùng",
    code: "TC-TRASH-1",
    pack: 12,
    archived: false,
  });
  const productId = state.products[0].id;
  state = command(state, "deleteProduct", { id: productId, reason: "Dọn sản phẩm thử" });
  assert.ok(state.products[0].deletedAt);
  assert.equal(state.products[0].archived, true);
  assert.equal(state.products[0].archivedBeforeDelete, false);
  state = command(state, "restoreProduct", { id: productId, reason: "Khôi phục sản phẩm" });
  assert.equal(state.products[0].deletedAt, undefined);
  assert.equal(state.products[0].archived, false);
  state = command(state, "deleteProduct", { id: productId, reason: "Xoá sản phẩm lần cuối" });
  state = command(state, "purgeProduct", { id: productId, reason: "Không còn tham chiếu" });
  assert.equal(state.products.length, 0);
});

test("không purge sản phẩm còn toa, chương trình, biến động kho hoặc tồn khác không", () => {
  const blockers = ["order", "program", "movement", "stock"] as const;
  for (const blocker of blockers) {
    let state = emptyState();
    state = command(state, "saveProduct", { name: `Sản phẩm ${blocker}`, code: `TC-${blocker}`, pack: 1 });
    const productId = state.products[0].id;
    if (blocker === "order") state.orders.push({ id: "o", code: "O", customerId: "c", date: "2026-09-11", notes: "", status: "draft", lines: [{ id: "l", productId, name: "SP", quantity: 1, price: "0", cost: "0", ceiling: "0", pack: 1, unit: "chai", kind: "sale", sponsor: "employee", discount: "0", delivered: 0, returned: 0 }], total: "0", margin: "0", reserved: "0", version: 1 });
    if (blocker === "program") state.programs.push({ id: "p", name: "P", mode: "single", lines: [{ id: "l", productId, name: "SP", quantity: 1, price: "0", cost: "0", ceiling: "0", pack: 1, unit: "chai", kind: "sale", sponsor: "employee", discount: "0", delivered: 0, returned: 0 }], count: 1, remaining: 1, price: "0", margin: "0", subsidy: "0", reserved: "0", guaranteeStock: false, status: "active", expiresAt: "2026-09-12", seed: 1 });
    if (blocker === "movement") state.inventoryMovements.push({ id: "m", productId, date: "2026-09-11", quantity: 1, reason: "Nhập", referenceId: "r" });
    if (blocker === "stock") state.inventory.push({ productId, quantity: 1, tracked: true, updatedAt: "2026-09-11T00:00:00Z", source: "Kho" });
    state = command(state, "deleteProduct", { id: productId, reason: "Đưa vào thùng rác" });
    assert.throws(() => command(state, "purgeProduct", { id: productId, reason: "Xoá vĩnh viễn" }), /còn toa|lịch sử kho/i);
  }
});

test("nhân viên không thể xoá, khôi phục hoặc purge sản phẩm", () => {
  let state = emptyState();
  state = command(state, "saveProduct", { name: "Sản phẩm quyền", code: "TC-RBAC", pack: 1 });
  for (const type of ["deleteProduct", "restoreProduct", "purgeProduct"])
    assert.throws(
      () => command(state, type, { id: state.products[0].id, reason: "Không có quyền" }, "employee"),
      /quản trị viên/i,
    );
});
