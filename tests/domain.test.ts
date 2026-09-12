import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute, previewPrograms } from "../server/domain.js";
import type { AppState } from "../shared/types.js";
const run = (s: AppState, type: string, payload: any) =>
  execute(s, {
    type,
    payload,
    idempotencyKey: crypto.randomUUID(),
    version: s.version,
  });
function fixture(cost = "11340", price = "13000") {
  let s = emptyState("Thử nghiệm");
  s = run(s, "saveProduct", {
    name: "NXV mẫu",
    pack: 40,
    unit: "dây",
    cost,
    price,
  });
  s = run(s, "saveCustomer", { name: "Khách mẫu" });
  return s;
}
function order(s: AppState, quantity = 80, price = "13000") {
  s = run(s, "saveOrder", {
    customerId: s.customers[0].id,
    date: "2026-09-10",
    lines: [{ productId: s.products[0].id, quantity, price }],
  });
  return run(s, "confirmOrder", { id: s.orders.at(-1)!.id });
}
describe("Quỹ thực giao và giữ ngân sách", () => {
  it("80 dây đúng 132800; đơn chưa giao không tăng quỹ; partial cross-month và trả", () => {
    let s = order(fixture());
    assert.equal(s.summary.fund, "0");
    assert.equal(s.orders[0].margin, "132800");
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      date: "2026-10-02",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 1 }],
    });
    assert.equal(s.summary.fund, "1660");
    assert.equal(s.orders[0].status, "partial");
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      date: "2026-10-03",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 79 }],
    });
    assert.equal(s.summary.fund, "132800");
    assert.equal(s.orders[0].status, "delivered");
    s = run(s, "recordReturn", {
      deliveryId: s.deliveries[1].id,
      date: "2026-10-04",
      reason: "Khách trả",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 2, restock: true }],
    });
    assert.equal(s.summary.fund, "129480");
    assert.equal(s.summary.delivered, "884520");
  });
  it("KPI chỉ theo ba can thực giao; bù chênh đổi cộng vào quỹ", () => {
    let s = fixture("135307", "140000");
    s = run(s, "saveOrder", {
      customerId: s.customers[0].id,
      date: "2026-09-10",
      lines: [{ productId: s.products[0].id, quantity: 4, price: "140000" }],
    });
    s = run(s, "confirmOrder", { id: s.orders[0].id });
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      date: "2026-09-10",
      exchangeTopUp: "1000",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 3 }],
    });
    assert.equal(s.summary.delivered, "405921");
    assert.equal(s.summary.customerDelivered, "420000");
    assert.equal(s.summary.fund, "15079");
    assert.equal(s.summary.available, "15079");
    assert.equal(s.orders[0].lines[0].delivered, 3);
    assert.equal(s.deliveries[0].exchangeTopUp, "1000");
  });
  it("giao vượt số lượng rollback nguyên tử", () => {
    const s = order(fixture());
    assert.throws(() =>
      run(s, "recordDelivery", {
        orderId: s.orders[0].id,
        lines: [{ lineId: s.orders[0].lines[0].id, quantity: 81 }],
      }),
    );
    assert.equal(s.deliveries.length, 0);
    assert.equal(s.orders[0].lines[0].delivered, 0);
  });
  it("500k chỉ giữ 3 suất cần bù150k, không10, quá200k/suất bị chặn", () => {
    let s = fixture("160000", "10000");
    s = run(s, "openingBalance", { amount: "500000", notes: "Số dư mẫu" });
    const payload = {
      name: "Suất mẫu",
      count: 3,
      allowSubsidy: true,
      lines: [{ productId: s.products[0].id, quantity: 1, price: "10000" }],
      expiresAt: "2099-01-01",
    };
    assert.throws(() => run(s, "reserveProgram", { ...payload, count: 10 }));
    s = run(s, "reserveProgram", payload);
    assert.equal(s.summary.available, "50000");
    assert.equal(s.summary.reserved, "450000");
    assert.throws(() => run(s, "reserveProgram", { ...payload, count: 1 }));
    s = run(s, "cancelProgram", { id: s.programs[0].id });
    assert.equal(s.summary.available, "500000");
    assert.throws(() =>
      run(s, "reserveProgram", {
        ...payload,
        count: 1,
        lines: [{ productId: s.products[0].id, quantity: 2, price: "10000" }],
      }),
    );
  });
  it("giao hàng lãi trước vẫn giữ quỹ cho quà giao sau", () => {
    let s = fixture("10000", "20000");
    s = run(s, "saveOrder", {
      customerId: s.customers[0].id,
      lines: [
        { productId: s.products[0].id, quantity: 1, price: "20000" },
        {
          productId: s.products[0].id,
          quantity: 1,
          price: "0",
          kind: "gift",
          sponsor: "employee",
        },
      ],
    });
    s = run(s, "confirmOrder", { id: s.orders[0].id });
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 1 }],
    });
    assert.equal(s.summary.fund, "10000");
    assert.equal(s.summary.reserved, "10000");
    assert.equal(s.summary.available, "0");
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      lines: [{ lineId: s.orders[0].lines[1].id, quantity: 1 }],
    });
    assert.equal(s.summary.fund, "0");
    assert.equal(s.summary.reserved, "0");
  });
  it("quà công ty không trừ quỹ; snapshot giá cũ không bị tính lại", () => {
    let s = fixture();
    s = run(s, "saveOrder", {
      customerId: s.customers[0].id,
      lines: [
        { productId: s.products[0].id, quantity: 1, price: "13000" },
        {
          productId: s.products[0].id,
          quantity: 1,
          price: "0",
          kind: "gift",
          sponsor: "company",
        },
      ],
    });
    s = run(s, "confirmOrder", { id: s.orders[0].id });
    s = run(s, "saveProduct", { ...s.products[0], cost: "12000" });
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      lines: s.orders[0].lines.map((l) => ({ lineId: l.id, quantity: 1 })),
    });
    assert.equal(s.summary.fund, "1660");
  });
  it("thiếu giá vốn không biến thành0 và không được chốt", () => {
    let s = fixture();
    s = run(s, "saveProduct", { name: "Kệ", pack: 1, price: "0" });
    assert.equal(s.products[1].cost, null);
    s = run(s, "saveOrder", {
      customerId: s.customers[0].id,
      lines: [
        { productId: s.products[0].id, quantity: 1, price: "13000" },
        { productId: s.products[1].id, quantity: 1, price: "0", kind: "gift" },
      ],
    });
    assert.equal(s.orders[0].margin, null);
    assert.throws(() => run(s, "confirmOrder", { id: s.orders[0].id }));
    assert.equal(s.summary.fund, "0");
  });
  it("kho giữ khi chốt, giao quà xuất kho, snapshot không cộng lặp", () => {
    let s = fixture();
    s = run(s, "adjustInventory", {
      productId: s.products[0].id,
      quantity: 100,
      mode: "snapshot",
      reason: "Kiểm kê",
    });
    s = run(s, "adjustInventory", {
      productId: s.products[0].id,
      quantity: 100,
      mode: "snapshot",
      reason: "Kiểm kê lại",
    });
    assert.equal(s.inventory[0].quantity, 100);
    s = order(s);
    assert.throws(() => order(s, 30));
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 80 }],
    });
    assert.equal(s.inventory[0].quantity, 20);
  });
  it("giữ chương trình chuyển qua đơn không giữ hai lần", () => {
    let s = fixture("160000", "10000");
    s = run(s, "openingBalance", { amount: "500000", notes: "Mẫu" });
    s = run(s, "reserveProgram", {
      count: 3,
      allowSubsidy: true,
      expiresAt: "2099-01-01",
      lines: [{ productId: s.products[0].id, quantity: 1, price: "10000" }],
    });
    s = run(s, "applyProgram", {
      id: s.programs[0].id,
      customerId: s.customers[0].id,
      count: 1,
    });
    assert.equal(s.summary.reserved, "450000");
    assert.equal(s.programs[0].remaining, 2);
    assert.equal(s.orders[0].reserved, "150000");
  });
  it("trần giá và version kiểm tra trên server", () => {
    const s = fixture();
    assert.throws(() => order(s, 1, "14000"));
    assert.throws(() =>
      execute(s, {
        type: "openingBalance",
        payload: { amount: "1", notes: "test" },
        version: 0,
        idempotencyKey: "wrong-version",
      }),
    );
    assert.equal(s.summary.fund, "0");
  });
  it("preview không giữ ngân sách và sinh đúng seed", () => {
    const s = fixture();
    const p = { seed: 42, count: 1, mode: "single" };
    assert.deepEqual(previewPrograms(s, p), previewPrograms(s, p));
    assert.equal(s.programs.length, 0);
    assert.equal(s.summary.reserved, "0");
  });
  it("preview chương trình không chọn sản phẩm đã xóa", () => {
    let s = fixture();
    const p = { seed: 42, count: 1, mode: "single" };
    assert.ok(previewPrograms(s, p).options.length > 0);
    s = execute(
      s,
      {
        type: "deleteProduct",
        payload: { id: s.products[0].id, reason: "Ẩn sản phẩm khỏi chương trình" },
        idempotencyKey: crypto.randomUUID(),
        version: s.version,
      },
      { id: "admin", role: "admin" },
    );
    assert.equal(previewPrograms(s, p).options.length, 0);
  });
  it("lịch theo tuyến gợi ý khách, hoàn thành ghi lượt chăm sóc và xóa mềm", () => {
    let s = emptyState("Nhân viên tuyến");
    s = run(s, "saveCustomer", { name: "Cửa hàng A", route: "Tuyến A" });
    s = run(s, "saveRouteSchedule", {
      date: "2026-09-13",
      startTime: "08:00",
      endTime: "10:00",
      route: "Tuyến A",
      notes: "Chăm sóc định kỳ",
      customerIds: [s.customers[0].id],
    });
    const schedule = s.routeSchedules![0];
    assert.equal(schedule.status, "planned");
    assert.deepEqual(schedule.customerIds, [s.customers[0].id]);
    s = run(s, "completeRouteSchedule", {
      id: schedule.id,
      completedCustomerIds: [s.customers[0].id],
      resultNotes: "Đã chăm sóc",
    });
    assert.equal(s.routeSchedules![0].status, "completed");
    assert.equal(s.visits.length, 1);
    assert.equal(s.visits[0].date, "2026-09-13");
    s = run(s, "completeRouteSchedule", { id: schedule.id, completedCustomerIds: [s.customers[0].id], resultNotes: "Cập nhật kết quả" });
    assert.equal(s.visits.length, 1);
    s = run(s, "deleteRouteSchedule", { id: schedule.id, reason: "Đổi tuyến chăm sóc" });
    assert.ok(s.routeSchedules![0].deletedAt);
  });
  it("quà TrueCare thực giao được tính KPI theo giá gốc dù công ty chịu chi phí", () => {
    let s = fixture();
    s = run(s, "saveOrder", {
      customerId: s.customers[0].id,
      lines: [
        { productId: s.products[0].id, quantity: 1, price: "13000" },
        {
          productId: s.products[0].id,
          quantity: 2,
          price: "0",
          kind: "gift",
          sponsor: "company",
        },
      ],
    });
    s = run(s, "confirmOrder", { id: s.orders[0].id });
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      lines: s.orders[0].lines.map((l) => ({
        lineId: l.id,
        quantity: l.quantity,
      })),
    });
    assert.equal(s.summary.delivered, "34020");
    assert.equal(s.summary.fund, "1660");
  });
  it("xoá toa đã giao đảo KPI/quỹ, chỉ hoàn phần kho chưa hoàn và admin khôi phục đúng một lần", () => {
    let s = fixture();
    s = run(s, "adjustInventory", {
      productId: s.products[0].id,
      quantity: 100,
      mode: "snapshot",
      reason: "Kiểm kê",
    });
    s = order(s, 10);
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      date: "2026-09-10",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 10 }],
    });
    s = run(s, "recordReturn", {
      deliveryId: s.deliveries[0].id,
      date: "2026-09-11",
      reason: "Khách trả",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 2, restock: true }],
    });
    assert.equal(s.inventory[0].quantity, 92);
    assert.equal(s.summary.fund, "13280");
    assert.equal(s.summary.delivered, "90720");
    s = execute(
      s,
      {
        type: "deleteOrder",
        payload: { id: s.orders[0].id, reason: "Nhập nhầm toa" },
        version: s.version,
        idempotencyKey: crypto.randomUUID(),
      },
      { id: "employee-1", role: "employee", now: "2026-09-12T01:00:00.000Z" },
    );
    assert.equal(s.inventory[0].quantity, 100);
    assert.equal(s.summary.fund, "0");
    assert.equal(s.summary.delivered, "0");
    assert.ok(s.orders[0].deletedAt);
    assert.throws(() =>
      execute(
        s,
        {
          type: "restoreOrder",
          payload: { id: s.orders[0].id, reason: "Thử" },
          version: s.version,
          idempotencyKey: crypto.randomUUID(),
        },
        { id: "employee-1", role: "employee" },
      ),
    );
    s = execute(
      s,
      {
        type: "restoreOrder",
        payload: { id: s.orders[0].id, reason: "Khôi phục theo đối chiếu" },
        version: s.version,
        idempotencyKey: crypto.randomUUID(),
      },
      { id: "admin-1", role: "admin", now: "2026-09-12T02:00:00.000Z" },
    );
    assert.equal(s.inventory[0].quantity, 92);
    assert.equal(s.summary.fund, "13280");
    assert.equal(s.summary.delivered, "90720");
    assert.equal(s.orders[0].deletedAt, undefined);
  });
  it("backend chặn nhân viên sửa sản phẩm, tồn kho và khách cũ quá 24 giờ", () => {
    const employee = {
      id: "employee-1",
      role: "employee" as const,
      now: "2026-09-10T00:00:00.000Z",
    };
    let s = fixture();
    assert.throws(() =>
      execute(
        s,
        {
          type: "saveProduct",
          payload: { name: "Sai quyền", pack: 1 },
          version: s.version,
          idempotencyKey: crypto.randomUUID(),
        },
        employee,
      ),
    );
    assert.throws(() =>
      execute(
        s,
        {
          type: "adjustInventory",
          payload: {
            productId: s.products[0].id,
            quantity: 1,
            reason: "Sai quyền",
          },
          version: s.version,
          idempotencyKey: crypto.randomUUID(),
        },
        employee,
      ),
    );
    s = execute(
      s,
      {
        type: "saveCustomer",
        payload: { name: "Khách mới" },
        version: s.version,
        idempotencyKey: crypto.randomUUID(),
      },
      employee,
    );
    const customer = s.customers.at(-1)!;
    s = execute(
      s,
      {
        type: "saveCustomer",
        payload: { ...customer, name: "Trong hạn" },
        version: s.version,
        idempotencyKey: crypto.randomUUID(),
      },
      { ...employee, now: "2026-09-10T23:59:59.000Z" },
    );
    assert.throws(() =>
      execute(
        s,
        {
          type: "saveCustomer",
          payload: { ...customer, name: "Quá hạn" },
          version: s.version,
          idempotencyKey: crypto.randomUUID(),
        },
        { ...employee, now: "2026-09-11T00:00:00.000Z" },
      ),
    );
  });
  it("sửa toa giao một phần tính lại chứng từ, KPI, quỹ và kho theo thực giao mới", () => {
    let s = fixture();
    s = run(s, "adjustInventory", {
      productId: s.products[0].id,
      quantity: 100,
      mode: "snapshot",
      reason: "Kiểm kê",
    });
    s = order(s, 10);
    s = run(s, "recordDelivery", {
      orderId: s.orders[0].id,
      date: "2026-09-10",
      lines: [{ lineId: s.orders[0].lines[0].id, quantity: 5 }],
    });
    const o = s.orders[0],
      d = s.deliveries[0];
    s = execute(
      s,
      {
        type: "reviseOrder",
        payload: {
          reason: "Đối chiếu phiếu giao",
          order: {
            id: o.id,
            customerId: o.customerId,
            date: o.date,
            notes: "Đã sửa",
            lines: [{ ...o.lines[0], quantity: 8, price: "12000" }],
            deliveries: [
              { id: d.id, lines: [{ lineId: o.lines[0].id, quantity: 4 }] },
            ],
          },
        },
        version: s.version,
        idempotencyKey: crypto.randomUUID(),
      },
      { id: "employee-1", role: "employee" },
    );
    assert.equal(s.inventory[0].quantity, 96);
    assert.equal(s.summary.delivered, "45360");
    assert.equal(s.summary.fund, "2640");
    assert.equal(s.orders[0].status, "partial");
    assert.equal(s.orders[0].revisions?.length, 1);
  });
});
