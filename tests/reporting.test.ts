import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute } from "../server/domain";
import {
  dailyReport,
  reportRows,
  reportTotals,
  groupRows,
  csvCell,
  productQuantities,
  workDaysBetween,
} from "../src/lib/reporting";
import type { AppState } from "../shared/types";
function fixture() {
  let state = emptyState("Nhân viên thử");
  let seq = 0;
  const cmd = (type: string, payload: unknown) => {
    state = execute(state, {
      type,
      payload,
      idempotencyKey: "report-test-" + ++seq,
    });
    return state;
  };
  cmd("saveProduct", {
    name: "Xả vải thử",
    pack: 40,
    unit: "dây",
    cost: "11340",
    price: "13000",
    group: "NXV",
    brand: "Test",
  });
  cmd("saveCustomer", {
    name: "Cửa hàng thử",
    address: "Địa chỉ thử",
    openedDate: "2026-09-01",
  });
  cmd("saveOrder", {
    customerId: state.customers[0].id,
    date: "2026-09-30",
    lines: [{ productId: state.products[0].id, quantity: 80, price: "13000" }],
  });
  cmd("confirmOrder", { id: state.orders[0].id });
  return {
    get state() {
      return state;
    },
    cmd,
  };
}
test("ordered and delivered use separate inclusive calendar ranges", () => {
  const f = fixture();
  const oid = f.state.orders[0].id,
    lid = f.state.orders[0].lines[0].id;
  f.cmd("recordDelivery", {
    orderId: oid,
    date: "2026-10-02",
    lines: [{ lineId: lid, quantity: 40 }],
  });
  assert.equal(
    reportTotals(
      reportRows(f.state, "ordered", { from: "2026-09-30", to: "2026-09-30" }),
    ).revenue,
    "1040000",
  );
  assert.equal(
    reportTotals(
      reportRows(f.state, "delivered", {
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).revenue,
    "0",
  );
  assert.equal(
    reportTotals(
      reportRows(f.state, "delivered", {
        from: "2026-10-02",
        to: "2026-10-02",
      }),
    ).revenue,
    "520000",
  );
  f.cmd("recordDelivery", {
    orderId: oid,
    date: "2026-10-03",
    lines: [{ lineId: lid, quantity: 40 }],
  });
  assert.equal(reportTotals(reportRows(f.state, "delivered")).orders, 1);
  assert.equal(f.state.summary.fund, "132800");
});
test("grouping changes hierarchy but not report totals and returns reduce on return date", () => {
  const f = fixture();
  f.cmd("recordDelivery", {
    orderId: f.state.orders[0].id,
    date: "2026-10-02",
    lines: [{ lineId: f.state.orders[0].lines[0].id, quantity: 80 }],
  });
  f.cmd("recordReturn", {
    deliveryId: f.state.deliveries[0].id,
    date: "2026-10-04",
    reason: "Trả thử",
    lines: [
      { lineId: f.state.orders[0].lines[0].id, quantity: 1, restock: false },
    ],
  });
  const rows = reportRows(f.state, "delivered");
  assert.equal(reportTotals(rows).revenue, "1027000");
  assert.equal(groupRows(rows, ["customer", "product"])[0].total, "1027000");
  assert.equal(
    reportTotals(
      reportRows(f.state, "delivered", {
        from: "2026-10-04",
        to: "2026-10-04",
      }),
    ).revenue,
    "-13000",
  );
});
test("delivered report can show gross revenue without changing KPI or fund", () => {
  const f = fixture();
  f.state.orders[0].lines[0].discount = "80000";
  f.cmd("recordDelivery", {
    orderId: f.state.orders[0].id,
    date: "2026-10-02",
    lines: [{ lineId: f.state.orders[0].lines[0].id, quantity: 40 }],
  });
  const net = reportTotals(
    reportRows(f.state, "delivered", { subtractDiscount: true }),
  );
  const gross = reportTotals(
    reportRows(f.state, "delivered", { subtractDiscount: false }),
  );
  assert.equal(net.revenue, "480000");
  assert.equal(gross.revenue, "520000");
  assert.equal(gross.employeeSales, net.employeeSales);
  assert.equal(gross.margin, net.margin);
});
test("units remain separate per product and pack, CSV cannot become executable formulas", () => {
  const f = fixture();
  const rows = reportRows(f.state, "ordered");
  const b = {
    ...rows[0],
    id: "b",
    productId: "other",
    product: "Sản phẩm thứ hai",
    pack: 24,
    unit: "chai",
    quantity: 25,
  };
  assert.match(productQuantities([...rows, b]), /2 thùng/);
  assert.match(productQuantities([...rows, b]), /1 thùng \+ 1 chai/);
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell("Tên bình thường"), '"Tên bình thường"');
});
test("end of reporting period does not divide by zero and respects holidays", () => {
  const s = emptyState("Nhân viên thử");
  s.settings.periodStart = "2026-09-01";
  s.settings.holidays = ["2026-09-02"];
  assert.equal(
    workDaysBetween(
      "2026-09-01",
      "2026-09-02",
      [1, 2, 3, 4, 5, 6],
      s.settings.holidays,
    ),
    1,
  );
  const text = dailyReport(s, "2026-09-30");
  assert.match(text, /Hết ngày làm việc/);
  assert.doesNotMatch(text, /NaN|Infinity/);
  assert.match(text, /_Số ASO: 15/);
});
