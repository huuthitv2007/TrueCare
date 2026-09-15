import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute, previewPrograms, previewSmartPrograms } from "../server/domain.js";
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
  it("chương trình thông minh dùng giá trần nguồn, preview không giữ quỹ và token không nhận dòng giá từ client", () => {
    let s = emptyState("Quản trị viên");
    s = run(s, "saveProduct", { name: "Túi NGX 4.2KG Care", code: "NGX-4.2-TUI", variant: "Majestic đỏ", pack: 4, unit: "túi", cost: "141000", price: "160000" });
    s = run(s, "saveProduct", { name: "Túi NXV 1.15 Lít", code: "NXV-1.15", variant: "Elizabeth tím", pack: 10, unit: "túi", cost: "70000", price: "77000" });
    s = run(s, "saveProduct", { name: "Túi NGX Care 4.2kg (màu chưa ghi, kỳ 07-13/09)", code: "TC-HIST-NGX42", variant: "Chưa ghi màu", pack: 4, unit: "túi", cost: "140720", price: "151000" });
    s = run(s, "saveCustomer", { name: "Khách chương trình" });
    s = run(s, "openingBalance", { amount: "1000000", notes: "Quỹ mẫu" });
    const before = s.summary.reserved;
    const preview = previewSmartPrograms(s, { count: 2, expiresAt: "2099-01-01" });
    const selected = preview.options.find((option) => option.gift?.id === "plastic-small")!;
    const sales = selected.lines.filter((line) => line.kind === "sale");
    assert.equal(sales.find((line) => selected.lineRoles[line.id] === "focus")?.price, "151000");
    assert.equal(sales.length, 2);
    assert.ok(sales.some((line) => selected.lineRoles[line.id] === "compensation"));
    assert.equal(preview.options.flatMap((option) => option.lines).some((line) => line.productId === s.products[2].id), false);
    assert.equal(s.summary.reserved, before);
    s = execute(s, { type: "reserveSmartProgram", payload: { token: selected.token, reason: "Lưu phương án thông minh" }, version: s.version, idempotencyKey: crypto.randomUUID() }, { id: "admin", role: "admin" });
    assert.equal(s.programs.length, 1);
    assert.equal(s.programs[0].smart?.pricebookId, "truecare-program-2026-06-10");
    assert.equal(s.programs[0].lines.find((line) => line.virtualGift)?.kpiEligible, false);
    assert.throws(() => execute(s, { type: "reserveSmartProgram", payload: { token: selected.token + "x", reason: "Lưu phương án thông minh" }, version: s.version, idempotencyKey: crypto.randomUUID() }, { id: "admin", role: "admin" }), /hết hạn|không hợp lệ/);
  });
  it("tặng phẩm chuẩn trừ quỹ khi giao nhưng không cộng KPI, còn nhân viên không thể lưu phương án", () => {
    let s = emptyState("Quản trị viên");
    s = run(s, "saveProduct", { name: "Túi NGX 4.2KG Care", code: "NGX-4.2-TUI", pack: 4, unit: "túi", cost: "141000", price: "151000" });
    s = run(s, "saveProduct", { name: "Túi NXV 1.15 Lít", code: "NXV-1.15", pack: 10, unit: "túi", cost: "70000", price: "77000" });
    s = run(s, "saveCustomer", { name: "Khách chương trình" });
    s = run(s, "openingBalance", { amount: "1000000", notes: "Quỹ mẫu" });
    const preview = previewSmartPrograms(s, { count: 1, expiresAt: "2099-01-01" });
    const selected = preview.options.find((option) => option.gift?.id === "plastic-small")!;
    assert.throws(() => execute(s, { type: "reserveSmartProgram", payload: { token: selected.token, reason: "Lưu phương án" }, version: s.version, idempotencyKey: crypto.randomUUID() }, { id: "employee", role: "employee" }), /quản trị viên/);
    s = execute(s, { type: "reserveSmartProgram", payload: { token: selected.token, reason: "Lưu phương án" }, version: s.version, idempotencyKey: crypto.randomUUID() }, { id: "admin", role: "admin" });
    s = run(s, "applyProgram", { id: s.programs[0].id, customerId: s.customers[0].id, count: 1 });
    const order = s.orders[0];
    s = run(s, "recordDelivery", { orderId: order.id, lines: order.lines.map((line) => ({ lineId: line.id, quantity: line.quantity })) });
    const deliveredKpi = order.lines.filter((line) => line.kind === "sale").reduce((sum, line) => sum + Number(line.cost) * line.quantity, 0);
    assert.equal(s.summary.delivered, String(deliveredKpi));
    assert.equal(s.summary.fund, String(1000000 + Number(order.margin)));
  });
  it("chương trình thông minh bắt buộc 1 thùng NHTT và hàng bù khác SKU, không dùng quỹ", () => {
    let s = emptyState("Quản trị viên");
    s.settings.focusProduct = "NGX túi 4,2kg";
    s = run(s, "saveProduct", { name: "Túi NGX 4.2KG Care", code: "NGX-4.2-TUI", pack: 4, unit: "túi", cost: "1000", price: "151000" });
    s = run(s, "saveProduct", { name: "Túi NXV 1.15 Lít", code: "NXV-1.15", pack: 10, unit: "túi", cost: "70000", price: "77000" });
    s = run(s, "saveProduct", { name: "Nước rửa chén NRC 750g", code: "NRC-750", pack: 24, unit: "chai", cost: "20000", price: "24500" });
    const preview = previewSmartPrograms(s, { count: 1, expiresAt: "2099-01-01" });
    assert.ok(preview.options.length > 0);
    for (const option of preview.options) {
      const sales = option.lines.filter((line) => line.kind === "sale");
      assert.ok(sales.length >= 2);
      assert.equal(sales.filter((line) => option.lineRoles[line.id] === "focus").length, 1);
      assert.ok(sales.some((line) => option.lineRoles[line.id] === "compensation"));
      assert.equal(option.subsidy, "0");
      assert.ok(Number(option.margin) >= 0);
      assert.ok(new Set(sales.map((line) => line.productId)).size >= 2);
    }
    const shelf = preview.options.find((option) => option.gift?.id === "shelf-4-tier");
    assert.ok(shelf);
    assert.equal(shelf.cases, 5);
    assert.equal(shelf.skuCount, 3);
  });
  it("chương trình thông minh giải thích khi NHTT không khớp catalog", () => {
    let s = emptyState("Quản trị viên");
    s.settings.focusProduct = "Sản phẩm không tồn tại";
    s = run(s, "saveProduct", { name: "Túi NXV 1.15 Lít", code: "NXV-1.15", pack: 10, unit: "túi", cost: "70000", price: "77000" });
    const preview = previewSmartPrograms(s, { count: 1, expiresAt: "2099-01-01" });
    assert.equal(preview.options.length, 0);
    assert.ok(preview.reasons.some((reason) => reason.includes("Nhãn hàng trọng tâm")));
  });
  it("lịch theo tuyến gợi ý khách, hoàn thành ghi lượt chăm sóc và xóa mềm", () => {
    let s = emptyState("Nhân viên tuyến");
    s.catalogs!.routes = ["Tuyến A"];
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
      performedDate: "2026-09-13",
    });
    assert.equal(s.routeSchedules![0].status, "completed");
    assert.equal(s.visits.length, 1);
    assert.equal(s.visits[0].date, "2026-09-13");
    s = run(s, "completeRouteSchedule", { id: schedule.id, completedCustomerIds: [s.customers[0].id], resultNotes: "Đã chăm sóc", performedDate: "2026-09-13" });
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
