import Decimal from "decimal.js";
import type { AppState, Order, OrderLine } from "../../shared/types";

export type ReportMode = "ordered" | "delivered";
export interface ReportFilters {
  from?: string;
  to?: string;
  query?: string;
  district?: string;
  route?: string;
  status?: string;
  productId?: string;
  group?: string;
  brand?: string;
  hasGift?: boolean;
  negativeMargin?: boolean;
  /** Only changes displayed delivered revenue; KPI and fund always use ledger values. */
  subtractDiscount?: boolean;
}
export interface ReportRow {
  id: string;
  orderId: string;
  code: string;
  date: string;
  customer: string;
  customerId: string;
  province: string;
  address: string;
  district: string;
  route: string;
  industry: string;
  brand: string;
  group: string;
  product: string;
  productId: string;
  unit: string;
  pack: number;
  quantity: number;
  revenue: string;
  employeeSales: string | null;
  margin: string | null;
  priceDifference: string;
  status: string;
}
export const dimensionLabels: Record<string, string> = {
  date: "Ngày",
  industry: "Ngành hàng",
  brand: "Nhãn hiệu",
  group: "Nhóm sản phẩm",
  product: "Tên sản phẩm",
  customer: "Khách hàng",
  province: "Tỉnh",
  address: "Địa chỉ",
  priceDifference: "Lệch giá",
  district: "Huyện",
  route: "Tuyến",
};
const D = (n: Decimal.Value) => new Decimal(n);
const sum = (xs: Decimal.Value[]) =>
  xs.reduce<Decimal>((a, b) => a.plus(b), D(0));
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
const within = (d: string, f: ReportFilters) =>
  (!f.from || d >= f.from) && (!f.to || d <= f.to);
export function reportRows(
  state: AppState,
  mode: ReportMode,
  filters: ReportFilters = {},
): ReportRow[] {
  const rows: ReportRow[] = [];
  const push = (
    order: Order,
    line: OrderLine,
    date: string,
    quantity: number,
    revenue: string,
    employeeSales: string | null,
    margin: string | null,
    id: string,
  ) => {
    if ((mode === "ordered" && line.kind !== "sale") || !within(date, filters))
      return;
    const customer = state.customers.find((c) => c.id === order.customerId),
      product = state.products.find((p) => p.id === line.productId);
    const row: ReportRow = {
      id,
      orderId: order.id,
      code: order.code,
      date,
      customer: customer?.name || "Khách đã lưu trữ",
      customerId: order.customerId,
      province: customer?.province || "",
      address: customer?.address || "",
      district: customer?.district || "",
      route: customer?.route || "",
      industry: "Chăm sóc gia đình",
      brand: product?.brand || "",
      group: product?.group || "",
      product: line.name,
      productId: line.productId,
      unit: line.unit,
      pack: line.pack,
      quantity,
      revenue,
      employeeSales,
      margin,
      priceDifference:
        line.ceiling === null
          ? "Chưa có giá"
          : D(line.price).minus(line.ceiling).toFixed(),
      status: order.status,
    };
    if (
      filters.query &&
      !fold(
        [row.code, row.customer, row.product, row.address].join(" "),
      ).includes(fold(filters.query))
    )
      return;
    if (
      (filters.district && row.district !== filters.district) ||
      (filters.route && row.route !== filters.route) ||
      (filters.status && row.status !== filters.status) ||
      (filters.productId && row.productId !== filters.productId) ||
      (filters.group && row.group !== filters.group) ||
      (filters.brand && row.brand !== filters.brand)
    )
      return;
    if (filters.hasGift && !order.lines.some((l) => l.kind !== "sale")) return;
    if (filters.negativeMargin && (margin === null || D(margin).gte(0))) return;
    rows.push(row);
  };
  for (const order of state.orders.filter((o) => !o.deletedAt && !o.purgedAt)) {
    if (mode === "ordered") {
      if (order.status === "draft") continue;
      for (const line of order.lines) {
        const q = order.status === "cancelled" ? line.delivered : line.quantity;
        if (!q) continue;
        const revenue = D(line.price)
          .times(q)
          .minus(D(line.discount).times(q).div(line.quantity));
        push(
          order,
          line,
          order.date,
          q,
          revenue.toFixed(),
          null,
          line.cost === null
            ? null
            : revenue.minus(D(line.cost).times(q)).toFixed(),
          order.id + ":" + line.id,
        );
      }
    } else {
      for (const delivery of state.deliveries.filter(
        (d) => d.orderId === order.id,
      ))
        for (const part of delivery.lines) {
          const line = order.lines.find((l) => l.id === part.lineId);
          if (line)
            push(
              order,
              line,
              delivery.date,
              part.quantity,
              filters.subtractDiscount === false && line.kind === "sale"
                ? D(line.price).times(part.quantity).toFixed()
                : part.revenue,
              line.cost === null
                ? null
                : D(line.cost).times(part.quantity).toFixed(),
              part.margin,
              delivery.id + ":" + part.lineId,
            );
        }
      for (const returned of state.returns.filter(
        (r) => r.orderId === order.id,
      ))
        for (const part of returned.lines) {
          const line = order.lines.find((l) => l.id === part.lineId);
          if (line)
            push(
              order,
              line,
              returned.date,
              -part.quantity,
              filters.subtractDiscount === false && line.kind === "sale"
                ? D(line.price).times(part.quantity).neg().toFixed()
                : D(part.revenue).neg().toFixed(),
              line.cost === null
                ? null
                : D(line.cost).times(-part.quantity).toFixed(),
              part.margin === null ? null : D(part.margin).neg().toFixed(),
              returned.id + ":" + part.lineId,
            );
        }
    }
  }
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code),
  );
}
export function reportTotals(rows: ReportRow[]) {
  return {
    revenue: sum(rows.map((r) => r.revenue))
      .toDecimalPlaces(0)
      .toFixed(0),
    employeeSales: rows.some((r) => r.employeeSales === null)
      ? null
      : sum(rows.map((r) => r.employeeSales!))
          .toDecimalPlaces(0)
          .toFixed(0),
    margin: rows.some((r) => r.margin === null)
      ? null
      : sum(rows.map((r) => r.margin!))
          .toDecimalPlaces(0)
          .toFixed(0),
    quantity: rows.reduce((a, b) => a + b.quantity, 0),
    orders: new Set(rows.map((r) => r.orderId)).size,
  };
}
export interface ReportGroup {
  key: string;
  dimension: string;
  value: string;
  total: string;
  quantity: number;
  orders: number;
  children: ReportGroup[];
  rows: ReportRow[];
}
export function groupRows(
  rows: ReportRow[],
  dimensions: string[],
): ReportGroup[] {
  const dims = dimensions.filter((d) => Object.hasOwn(dimensionLabels, d));
  if (!dims.length) return [];
  const [dimension, ...rest] = dims;
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const v = String(row[dimension as keyof ReportRow] || "Chưa cập nhật");
    groups.set(v, [...(groups.get(v) || []), row]);
  }
  return [...groups].map(([value, items]) => ({
    key: dimension + ":" + value,
    dimension,
    value,
    total: reportTotals(items).revenue,
    quantity: reportTotals(items).quantity,
    orders: reportTotals(items).orders,
    children: groupRows(items, rest),
    rows: items,
  }));
}
export function productQuantities(rows: ReportRow[]): string {
  const groups = new Map<
    string,
    { name: string; pack: number; unit: string; quantity: number }
  >();
  for (const r of rows) {
    const key = r.productId + ":" + r.pack + ":" + r.unit;
    const entry = groups.get(key) || {
      name: r.product,
      pack: r.pack,
      unit: r.unit,
      quantity: 0,
    };
    entry.quantity += r.quantity;
    groups.set(key, entry);
  }
  return (
    [...groups.values()]
      .map((g) => {
        const abs = Math.abs(g.quantity),
          cases = Math.floor(abs / g.pack),
          loose = abs % g.pack;
        return `${g.name}: ${g.quantity < 0 ? "-" : ""}${cases} thùng${loose ? ` + ${loose} ${g.unit}` : ""}`;
      })
      .join("; ") || "0"
  );
}
function monthEnd(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function workDaysBetween(
  from: string,
  to: string,
  days: number[],
  holidays: string[],
): number {
  let count = 0;
  for (
    let ms = Date.parse(from + "T00:00:00Z");
    ms <= Date.parse(to + "T00:00:00Z");
    ms += 86400000
  ) {
    const d = new Date(ms);
    if (
      days.includes(d.getUTCDay()) &&
      !holidays.includes(d.toISOString().slice(0, 10))
    )
      count++;
  }
  return count;
}
export function attendanceDaysBetween(
  state: AppState,
  from: string,
  to: string,
): number {
  return (state.attendance ?? []).filter(
    (item) => item.status === "worked" && item.date >= from && item.date <= to,
  ).length;
}
export function attendanceForDate(state: AppState, date: string) {
  return (state.attendance ?? []).find((item) => item.date === date);
}
const nextDate = (date: string) =>
  new Date(Date.parse(date + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
const fmt = (value: Decimal.Value) =>
  D(value).toDecimalPlaces(0).toNumber().toLocaleString("vi-VN");
const pct = (value: Decimal.Value, target: Decimal.Value) =>
  D(target).gt(0)
    ? D(value).div(target).times(100).toDecimalPlaces(2).toFixed() + "%"
    : "Chưa có mục tiêu";
export function dailyReport(
  state: AppState,
  date: string,
  mode: ReportMode = "delivered",
): string {
  const cfg = state.settings;
  const start =
    typeof cfg.periodStart === "string" && cfg.periodStart <= date
      ? cfg.periodStart
      : date.slice(0, 7) + "-01";
  const end =
    typeof cfg.periodEnd === "string" && cfg.periodEnd >= date
      ? cfg.periodEnd
      : monthEnd(date);
  const dayRows = reportRows(state, mode, { from: date, to: date }),
    periodRows = reportRows(state, mode, { from: start, to: date });
  const daily = reportTotals(dayRows),
    total = reportTotals(periodRows);
  const daySales = D(
      mode === "delivered" ? (daily.employeeSales ?? 0) : daily.revenue,
    ),
    periodSales = D(
      mode === "delivered" ? (total.employeeSales ?? 0) : total.revenue,
    ),
    sales = periodSales.plus(cfg.openingSales || 0);
  const remainingDays = workDaysBetween(
      nextDate(date),
      end,
      cfg.workDays,
      cfg.holidays,
    ),
    allDays = workDaysBetween(start, end, cfg.workDays, cfg.holidays),
    elapsed = attendanceDaysBetween(state, start, date);
  const shortfall = Decimal.max(0, D(cfg.monthlyTarget).minus(sales));
  const newDay = state.customers.filter((c) => c.openedDate === date).length,
    newPeriod = state.customers.filter(
      (c) => c.openedDate >= start && c.openedDate <= date,
    ).length;
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const routes =
    [
      ...new Set(
        state.customers
          .filter((c) => c.visitDays.includes(weekday) && !c.archived)
          .map((c) => c.route)
          .filter(Boolean),
      ),
    ].join(", ") || "Chưa thiết lập";
  const category = (rs: ReportRow[], group: string) =>
    productQuantities(
      rs.filter((r) =>
        group === "#" ? !["NGX", "NXV"].includes(r.group) : r.group === group,
      ),
    );
  const focus = (rs: ReportRow[]) =>
    productQuantities(
      rs.filter(
        (r) =>
          r.productId === cfg.focusProduct ||
          fold(r.product).includes(fold(String(cfg.focusProduct))),
      ),
    );
  const careVisits = state.visits.filter((visit) => visit.date === date).length;
  return [
    `BCDS Ngày ${date.split("-").reverse().join("/")}`,
    `NV: ${cfg.displayName} - Tuyến: ${routes}`,
    `_Số ASO: ${cfg.aso}`,
    `_DS: ${fmt(daySales)}đ / ${fmt(cfg.dailyTarget)}đ / ${pct(daySales, cfg.dailyTarget)}`,
    `_Lũy tiến: ${fmt(sales)}đ / ${fmt(cfg.monthlyTarget)}đ / ${pct(sales, cfg.monthlyTarget)}`,
    `_Thời gian đã bán: ${elapsed}/${allDays} ngày / ${pct(elapsed, allDays)}`,
    `_DS còn lại: ${remainingDays ? fmt(shortfall.div(remainingDays)) + "đ/ngày (" + remainingDays + " ngày còn lại)" : "Hết ngày làm việc; còn thiếu " + fmt(shortfall) + "đ"}`,
    `_ĐH: ${daily.orders} / Lũy tiến: ${total.orders + Number(cfg.openingOrders || 0)}`,
    `_MM: ${newDay} / Lũy tiến: ${newPeriod + Number(cfg.openingCustomers || 0)} / ${cfg.newCustomerTarget}`,
    `_CSKH: ${careVisits} lượt chăm sóc`,
    `_NGX: ${category(dayRows, "NGX")} / Lũy tiến: ${category(periodRows, "NGX")}`,
    `_NXV: ${category(dayRows, "NXV")} / Lũy tiến: ${category(periodRows, "NXV")}`,
    `_#: ${category(dayRows, "#")} / Lũy tiến: ${category(periodRows, "#")}`,
    `_NHTT: ${focus(dayRows)} / Lũy tiến: ${focus(periodRows)}`,
  ].join("\n");
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportSalesCsv(rows: ReportRow[]) {
  return [
    [
      "Mã đơn",
      "Ngày",
      "Khách hàng",
      "Sản phẩm",
      "Số lượng",
      "Đơn vị",
      "Thành tiền",
      "KPI theo giá gốc",
      "Quỹ",
      "Trạng thái",
    ],
    ...rows.map((r) => [
      r.code,
      r.date,
      r.customer,
      r.product,
      r.quantity,
      r.unit,
      r.revenue,
      r.employeeSales ?? "Chưa đủ căn cứ",
      r.margin ?? "Chưa đủ căn cứ",
      r.status,
    ]),
  ]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
}
