import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHptSaleOutHtml } from "../server/hpt-saleout";

test("parses HPT grouped sale-out rows without losing row-spanned dates", () => {
  const report = parseHptSaleOutHtml(`
    <table><tr><td>Tổng số lượng :330 Tổng tiền 15,513,806</td></tr></table>
    <table><tr><th>Ngày</th><th>Tên KH</th><th>Doanh số</th></tr>
      <tr><td rowspan="2">07/09/2026</td><td>BG7 Hữu Thi</td><td>582.610</td></tr>
      <tr><td>TH Dì Quyên</td><td>656.000</td></tr>
      <tr><td>10/09/2026</td><td>Cửa hàng Minh Quân</td><td>-.649.176</td></tr>
    </table>
  `);
  assert.equal(report.quantity, 330);
  assert.equal(report.total, "15513806");
  assert.deepEqual(report.rows, [
    { date: "2026-09-07", customer: "BG7 Hữu Thi", amount: "582610" },
    { date: "2026-09-07", customer: "TH Dì Quyên", amount: "656000" },
    { date: "2026-09-10", customer: "Cửa hàng Minh Quân", amount: "-649176" },
  ]);
});

test("returns empty detail rows when HPT only returns an aggregate", () => {
  const report = parseHptSaleOutHtml("<table>Tổng số lượng :0 Tổng tiền 0</table>");
  assert.equal(report.quantity, 0);
  assert.equal(report.total, "0");
  assert.deepEqual(report.rows, []);
});
