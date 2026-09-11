import Decimal from "decimal.js";
import {
  deleteOrder,
  restoreOrder,
  purgeOrder,
  reviseOrder,
  revision,
  orderSnapshot,
  type Actor,
} from "./order-lifecycle.js";
import { randomUUID } from "node:crypto";
import type {
  AppState,
  Command,
  Order,
  OrderLine,
  Product,
} from "../shared/types.js";
import { defaultCatalogs } from "../shared/catalogs.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  test: unknown,
  message: string,
  code = "INVALID",
): asserts test {
  if (!test) throw new DomainError(code, message);
}
const id = () => randomUUID();
const date = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const validDate = (value: any) => {
  assert(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value,
    "Ngày không hợp lệ",
  );
  return value;
};
const D = (value: any) => {
  try {
    const d = new Decimal(value);
    assert(d.isFinite(), "Số tiền không hợp lệ");
    return d;
  } catch {
    throw new DomainError("INVALID", "Số tiền không hợp lệ");
  }
};
const money = (value: any) => D(value).toDecimalPlaces(0).toFixed(0);
const positiveQuantity = (value: any) => {
  assert(
    Number.isSafeInteger(value) && value > 0 && value <= 1000000,
    "Số lượng phải là số nguyên dương",
  );
  return value as number;
};
const sum = (items: any[]) => items.reduce((a, b) => a.plus(b), new Decimal(0));
const found = <T extends { id: string }>(list: T[], key: string) => {
  const item = list.find((i) => i.id === key);
  assert(item, "Không tìm thấy dữ liệu thuộc tài khoản này", "NOT_FOUND");
  return item;
};
export function emptyState(displayName = ""): AppState {
  return {
    version: 0,
    sharedVersion: 0,
    catalogs: structuredClone(defaultCatalogs),
    products: [],
    customers: [],
    orders: [],
    deliveries: [],
    returns: [],
    payments: [],
    ledger: [],
    programs: [],
    inventory: [],
    inventoryMovements: [],
    visits: [],
    audit: [],
    imports: [],
    settings: {
      displayName,
      companyCode: "TRUECARE",
      dailyTarget: "4000000",
      monthlyTarget: "80000000",
      newCustomerTarget: 30,
      aso: 15,
      theme: "light",
      workDays: [1, 2, 3, 4, 5, 6],
      holidays: [],
      focusProduct: "NGX túi 4,2kg",
      periodStart: date().slice(0, 7) + "-01",
      openingSales: "0",
      reportGroups: ["date"],
    },
    summary: {
      ordered: "0",
      delivered: "0",
      customerDelivered: "0",
      collected: "0",
      fund: "0",
      reserved: "0",
      available: "0",
      pendingMargin: "0",
      unresolved: 0,
    },
  };
}
export const lineRevenue = (l: OrderLine, q = l.quantity) =>
  l.kind === "sale"
    ? D(l.price).times(q).minus(D(l.discount).times(q).div(l.quantity))
    : D(0);
export const lineMargin = (l: OrderLine, q = l.quantity) =>
  l.cost === null
    ? null
    : lineRevenue(l, q).minus(
        l.kind !== "sale" && l.sponsor === "company" ? 0 : D(l.cost).times(q),
      );
const orderValues = (o: Order) => {
  o.total = money(sum(o.lines.map((l) => money(lineRevenue(l)))));
  o.margin = o.lines.some((l) => lineMargin(l) === null)
    ? null
    : money(sum(o.lines.map((l) => money(lineMargin(l)!))));
};
const deliveryEmployeeSales = (
  s: AppState,
  d: AppState["deliveries"][number],
) =>
  sum(
    d.lines.map((part) => {
      const line = s.orders
        .find((o) => o.id === d.orderId)
        ?.lines.find((l) => l.id === part.lineId);
      return line?.cost != null ? D(line.cost).times(part.quantity) : 0;
    }),
  );
const returnEmployeeSales = (s: AppState, r: AppState["returns"][number]) =>
  sum(
    r.lines.map((part) => {
      const line = s.orders
        .find((o) => o.id === r.orderId)
        ?.lines.find((l) => l.id === part.lineId);
      return line?.cost != null ? D(line.cost).times(part.quantity) : 0;
    }),
  );
export function refresh(s: AppState) {
  const activeIds = new Set(
    s.orders.filter((o) => !o.deletedAt).map((o) => o.id),
  );
  const orders = s.orders.filter((o) => activeIds.has(o.id)),
    deliveries = s.deliveries.filter((d) => activeIds.has(d.orderId)),
    returns = s.returns.filter((r) => activeIds.has(r.orderId));
  const fund = sum(s.ledger.map((l) => l.amount));
  const reserved = sum([
    ...orders.map((o) => o.reserved),
    ...s.programs.filter((p) => p.status === "active").map((p) => p.reserved),
  ]);
  const employeeDelivered = sum(
    deliveries.map((d) => deliveryEmployeeSales(s, d)),
  ).minus(sum(returns.map((r) => returnEmployeeSales(s, r))));
  const customerDelivered = sum(deliveries.map((d) => d.total)).minus(
    sum(returns.flatMap((r) => r.lines.map((l) => l.revenue))),
  );
  s.summary = {
    ordered: money(
      sum(
        orders
          .filter((o) => o.status !== "draft")
          .map((o) =>
            o.status === "cancelled"
              ? deliveries
                  .filter((d) => d.orderId === o.id)
                  .reduce((a, d) => a.plus(d.total), D(0))
              : o.total,
          ),
      ),
    ),
    delivered: money(employeeDelivered),
    customerDelivered: money(customerDelivered),
    collected: money(sum(s.payments.map((p) => p.amount))),
    fund: money(fund),
    reserved: money(reserved),
    available: money(fund.minus(reserved)),
    pendingMargin: money(
      sum(
        orders
          .filter((o) => ["confirmed", "partial"].includes(o.status))
          .flatMap((o) =>
            o.lines.map((l) => lineMargin(l, l.quantity - l.delivered) ?? 0),
          ),
      ),
    ),
    unresolved:
      orders.filter((o) => o.margin === null).length +
      deliveries.filter((d) => d.margin === null).length,
  };
  return s;
}
export function parseOrderLines(
  s: AppState,
  input: any[],
  historical = false,
): OrderLine[] {
  assert(
    Array.isArray(input) && input.length > 0 && input.length <= 200,
    "Toa cần từ 1 đến 200 dòng hàng",
  );
  return input.map((x) => {
    const p = found(s.products, x.productId);
    assert(!p.archived, "Sản phẩm đã lưu trữ");
    const q = positiveQuantity(x.quantity);
    const price = D(x.price ?? p.price ?? 0);
    assert(price.gte(0), "Giá bán không được âm");
    const discount = D(x.discount ?? 0);
    assert(
      discount.gte(0) && discount.lte(price.times(q)),
      "Chiết khấu vượt tiền hàng",
    );
    const kind = ["sale", "gift", "display"].includes(x.kind) ? x.kind : "sale";
    if (!historical && kind === "sale") {
      assert(p.price !== null, "Chưa có giá chào");
      assert(price.lte(p.price), "Giá bán vượt bảng giá chào", "PRICE_CEILING");
    }
    return {
      id: x.id || id(),
      productId: p.id,
      name: p.name,
      quantity: q,
      price: price.toFixed(),
      cost: p.cost,
      ceiling: p.price,
      pack: p.pack,
      unit: p.unit,
      kind,
      sponsor: x.sponsor === "company" ? "company" : "employee",
      discount: discount.toFixed(),
      delivered: 0,
      returned: 0,
      fixedPrice: !!x.fixedPrice,
    };
  });
}
export function reservedStock(
  s: AppState,
  productId: string,
  excludeOrder?: string,
  excludeProgram?: string,
) {
  return (
    s.orders
      .filter(
        (o) =>
          !o.deletedAt &&
          o.id !== excludeOrder &&
          ["confirmed", "partial"].includes(o.status),
      )
      .flatMap((o) => o.lines)
      .filter((l) => l.productId === productId)
      .reduce((a, l) => a + l.quantity - l.delivered, 0) +
    s.programs
      .filter(
        (p) =>
          p.id !== excludeProgram && p.status === "active" && p.guaranteeStock,
      )
      .reduce(
        (a, p) =>
          a +
          p.remaining *
            p.lines
              .filter((l) => l.productId === productId)
              .reduce((b, l) => b + l.quantity, 0),
        0,
      )
  );
}
function stockCheck(
  s: AppState,
  ls: OrderLine[],
  excludeOrder?: string,
  excludeProgram?: string,
  count = 1,
) {
  for (const productId of new Set(ls.map((l) => l.productId))) {
    const inv = s.inventory.find((i) => i.productId === productId);
    if (!inv?.tracked) continue;
    const need =
      ls
        .filter((l) => l.productId === productId)
        .reduce((a, l) => a + l.quantity - l.delivered, 0) * count;
    assert(
      inv.quantity -
        reservedStock(s, productId, excludeOrder, excludeProgram) >=
        need,
      "Không đủ tồn khả dụng: " + found(s.products, productId).name,
      "INSUFFICIENT_STOCK",
    );
  }
}
function reserveOrder(s: AppState, o: Order) {
  if (o.margin === null) {
    o.reserved = "0";
    return;
  }
  const remaining = sum(
    o.lines.map((l) => lineMargin(l, l.quantity - l.delivered)!),
  );
  const need = Decimal.max(0, remaining.neg());
  refresh(s);
  assert(
    D(s.summary.available).plus(o.reserved).gte(need),
    "Không đủ quỹ đã giao để giữ cho phần hàng còn lại",
    "INSUFFICIENT_FUND",
  );
  o.reserved = money(need);
}
function audit(
  s: AppState,
  type: string,
  referenceId: string,
  details: string,
) {
  s.audit.push({
    id: id(),
    at: new Date().toISOString(),
    type,
    referenceId,
    details,
  });
}
export function execute(
  state: AppState,
  command: Command,
  actor?: Actor,
): AppState {
  if (
    actor?.role === "employee" &&
    [
      "saveProduct",
      "deleteProduct",
      "restoreProduct",
      "purgeProduct",
      "adjustInventory",
      "restoreOrder",
      "purgeOrder",
      "saveCatalog",
      "deleteCustomer",
      "restoreCustomer",
      "purgeCustomer",
      "mergeCustomer",
      "renameCatalog",
    ].includes(command.type)
  )
    throw new DomainError(
      "FORBIDDEN",
      "Chỉ quản trị viên được thực hiện thao tác này",
      403,
    );
  const s = structuredClone(state);
  const p = command.payload ?? {};
  refresh(s);
  const ref = p.id ?? p.orderId ?? p.order?.id;
  if (!["restoreOrder", "purgeOrder"].includes(command.type) && ref)
    assert(
      !s.orders.find((o) => o.id === ref)?.deletedAt,
      "Toa đã xoá không được thay đổi",
      "CONFLICT",
    );
  if (p.deliveryId)
    assert(
      !s.orders.find(
        (o) =>
          o.id === s.deliveries.find((d) => d.id === p.deliveryId)?.orderId,
      )?.deletedAt,
      "Toa đã xoá không được thay đổi",
      "CONFLICT",
    );
  if (command.version !== undefined)
    assert(
      command.version === s.version,
      "Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu.",
      "CONFLICT",
    );
  switch (command.type) {
    case "saveProduct": {
      const x = p.product ?? p;
      assert(typeof x.name === "string" && x.name.trim(), "Cần tên sản phẩm");
      const pack = positiveQuantity(Number(x.pack));
      const cost = x.cost == null || x.cost === "" ? null : D(x.cost).toFixed();
      const price =
        x.price == null || x.price === "" ? null : D(x.price).toFixed();
      assert(
        (cost === null || D(cost).gte(0)) &&
          (price === null || D(price).gte(0)),
        "Giá không được âm",
      );
      const old = x.id ? found(s.products, x.id) : undefined;
      assert(!old?.deletedAt, "Sản phẩm đang nằm trong thùng rác", "CONFLICT");
      const before = old ? structuredClone(old) : null;
      const code = String(x.code ?? "").trim();
      assert(
        !code ||
          !!x.archived ||
          !s.products.some(
            (product) =>
              product.id !== old?.id &&
              !product.archived &&
              product.code.trim().toLocaleLowerCase("vi") ===
                code.toLocaleLowerCase("vi"),
          ),
        "Mã sản phẩm đang được sử dụng",
        "DUPLICATE_PRODUCT_CODE",
      );
      const item: Product = {
        id: old?.id ?? id(),
        name: x.name.trim(),
        code,
        group: String(x.group ?? ""),
        brand: String(x.brand ?? ""),
        variant: String(x.variant ?? ""),
        unit: String(x.unit ?? "chai"),
        pack,
        cost,
        price,
        effectiveDate: validDate(x.effectiveDate ?? date()),
        archived: !!x.archived,
        sourceOwner: old?.sourceOwner,
        needsReview: actor?.role === "admin" ? false : old?.needsReview,
      };
      if (old) Object.assign(old, item);
      else s.products.push(item);
      audit(s, command.type, item.id, JSON.stringify({ before, after: item }));
      break;
    }
    case "deleteProduct": {
      assert(actor?.role === "admin", "Chỉ admin được xoá sản phẩm", "FORBIDDEN");
      const product = found(s.products, p.id);
      assert(!product.deletedAt, "Sản phẩm đã nằm trong thùng rác", "CONFLICT");
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do xoá sản phẩm");
      product.archivedBeforeDelete = !!product.archived;
      product.archived = true;
      product.deletedAt = actor.now ?? new Date().toISOString();
      product.deletedBy = actor.id;
      product.deletionReason = reason;
      audit(s, command.type, product.id, reason);
      break;
    }
    case "restoreProduct": {
      assert(actor?.role === "admin", "Chỉ admin được khôi phục sản phẩm", "FORBIDDEN");
      const product = found(s.products, p.id);
      assert(product.deletedAt, "Sản phẩm không nằm trong thùng rác", "CONFLICT");
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do khôi phục sản phẩm");
      if (!product.archivedBeforeDelete && product.code)
        assert(
          !s.products.some(
            (item) =>
              item.id !== product.id &&
              !item.archived &&
              !item.deletedAt &&
              item.code.trim().toLocaleLowerCase("vi") ===
                product.code.trim().toLocaleLowerCase("vi"),
          ),
          "Mã sản phẩm đang được một sản phẩm khác sử dụng",
          "DUPLICATE_PRODUCT_CODE",
        );
      product.archived = product.archivedBeforeDelete ?? false;
      delete product.deletedAt;
      delete product.deletedBy;
      delete product.deletionReason;
      delete product.archivedBeforeDelete;
      audit(s, command.type, product.id, reason);
      break;
    }
    case "purgeProduct": {
      assert(actor?.role === "admin", "Chỉ admin được xoá vĩnh viễn sản phẩm", "FORBIDDEN");
      const product = found(s.products, p.id);
      assert(product.deletedAt, "Sản phẩm phải nằm trong thùng rác", "CONFLICT");
      assert(
        !s.orders.some((order) => order.lines.some((line) => line.productId === product.id)) &&
          !s.programs.some((program) => program.lines.some((line) => line.productId === product.id)) &&
          !s.inventoryMovements.some((movement) => movement.productId === product.id) &&
          !s.inventory.some((stock) => stock.productId === product.id && stock.quantity !== 0),
        "Sản phẩm còn toa, chương trình hoặc lịch sử kho nên không thể xoá vĩnh viễn",
        "PRODUCT_HAS_HISTORY",
      );
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do xoá vĩnh viễn");
      s.products = s.products.filter((item) => item.id !== product.id);
      s.inventory = s.inventory.filter((item) => item.productId !== product.id);
      audit(s, command.type, product.id, reason);
      break;
    }
    case "saveCustomer": {
      const x = p.customer ?? p;
      assert(typeof x.name === "string" && x.name.trim(), "Cần tên khách hàng");
      const old = x.id ? found(s.customers, x.id) : undefined;
      assert(!old?.deletedAt && !old?.mergedInto, "Khách hàng đang ở thùng rác hoặc đã được gộp", "CONFLICT");
      if (actor?.role === "employee") {
        assert(
          !x.archived,
          "Nhân viên không được lưu trữ khách hàng",
          "FORBIDDEN",
        );
        if (old) {
          const age =
            Date.parse(actor.now ?? new Date().toISOString()) -
            Date.parse(old.createdAt ?? "");
          assert(
            old.createdBy === actor.id &&
              !old.legacyLocked &&
              Number.isFinite(age) &&
              age >= 0 &&
              age < 86400000,
            "Chỉ được sửa khách mình tạo trong 24 giờ",
            "FORBIDDEN",
          );
        }
      }
      const item = {
        id: old?.id ?? id(),
        name: x.name.trim(),
        contact: String(x.contact ?? ""),
        phone: String(x.phone ?? ""),
        email: String(x.email ?? ""),
        address: String(x.address ?? ""),
        street: String(x.street ?? ""),
        ward: String(x.ward ?? ""),
        district: String(x.district ?? ""),
        province: String(x.province ?? ""),
        route: String(x.route ?? ""),
        visitDays: Array.isArray(x.visitDays)
          ? x.visitDays.filter(
              (n: any) => Number.isInteger(n) && n >= 0 && n <= 6,
            )
          : [],
        frequency: String(x.frequency ?? ""),
        storeType: String(x.storeType ?? ""),
        notes: String(x.notes ?? ""),
        openedDate: validDate(x.openedDate ?? date()),
        archived: !!x.archived,
        createdBy: old ? old.createdBy : actor?.id,
        createdAt: old
          ? old.createdAt
          : (actor?.now ?? new Date().toISOString()),
        updatedAt: actor?.now ?? new Date().toISOString(),
        legacyLocked: old?.legacyLocked,
      };
      if (old) Object.assign(old, item);
      else s.customers.push(item);
      audit(s, command.type, item.id, JSON.stringify({ archived: item.archived }));
      break;
    }
    case "deleteCustomer": {
      assert(actor?.role === "admin", "Chỉ admin được xoá khách hàng", "FORBIDDEN");
      const customer = found(s.customers, p.id);
      assert(!customer.deletedAt && !customer.mergedInto, "Khách hàng không còn hoạt động", "CONFLICT");
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do xoá khách hàng");
      customer.archived = true;
      customer.deletedAt = actor.now ?? new Date().toISOString();
      customer.deletedBy = actor.id;
      customer.deletionReason = reason;
      customer.updatedAt = customer.deletedAt;
      audit(s, command.type, customer.id, reason);
      break;
    }
    case "restoreCustomer": {
      assert(actor?.role === "admin", "Chỉ admin được khôi phục khách hàng", "FORBIDDEN");
      const customer = found(s.customers, p.id);
      assert(customer.deletedAt && !customer.mergedInto, "Khách hàng không nằm trong thùng rác", "CONFLICT");
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do khôi phục khách hàng");
      delete customer.deletedAt;
      delete customer.deletedBy;
      delete customer.deletionReason;
      customer.archived = false;
      customer.updatedAt = actor.now ?? new Date().toISOString();
      audit(s, command.type, customer.id, reason);
      break;
    }
    case "purgeCustomer": {
      assert(actor?.role === "admin", "Chỉ admin được xoá vĩnh viễn khách hàng", "FORBIDDEN");
      const customer = found(s.customers, p.id);
      assert(customer.deletedAt && !customer.mergedInto, "Khách hàng phải nằm trong thùng rác", "CONFLICT");
      assert(
        !s.orders.some((order) => order.customerId === customer.id) &&
          !s.visits.some((visit) => visit.customerId === customer.id),
        "Khách hàng còn lịch sử nên không thể xoá vĩnh viễn",
        "CUSTOMER_HAS_HISTORY",
      );
      const reason = String(p.reason ?? "").trim();
      assert(reason.length >= 3, "Cần lý do xoá vĩnh viễn");
      s.customers = s.customers.filter((item) => item.id !== customer.id);
      audit(s, command.type, customer.id, reason);
      break;
    }
    case "saveCatalog": {
      assert(
        actor?.role === "admin",
        "Chỉ admin được sửa danh mục",
        "FORBIDDEN",
      );
      const current = s.catalogs ?? structuredClone(defaultCatalogs);
      const next = { ...current };
      for (const key of [
        "districts",
        "visitDays",
        "storeTypes",
        "routes",
        "brands",
        "groups",
        "units",
        "frequencies",
      ] as const) {
        if (p[key] === undefined) continue;
        assert(
          Array.isArray(p[key]) && p[key].length <= 200,
          "Danh mục không hợp lệ",
        );
        const values = [
          ...new Set(
            p[key]
              .map((value: unknown) => String(value).trim())
              .filter(Boolean),
          ),
        ];
        assert(
          values.every((value) => value.length <= 120),
          "Giá trị danh mục quá dài",
        );
        next[key] = values;
      }
      assert(
        next.districts.length > 0 &&
          next.storeTypes.length > 0 &&
          next.visitDays.length === 6,
        "Cần đủ huyện, loại cửa hiệu và Thứ Hai đến Thứ Bảy",
      );
      s.catalogs = next;
      break;
    }
    case "renameCatalog": {
      assert(actor?.role === "admin", "Chỉ admin được đổi tên danh mục", "FORBIDDEN");
      const kind = String(p.kind ?? "") as keyof typeof defaultCatalogs;
      const oldValue = String(p.oldValue ?? "").trim();
      const newValue = String(p.newValue ?? "").trim();
      const reason = String(p.reason ?? "").trim();
      const catalogs = s.catalogs ?? structuredClone(defaultCatalogs);
      assert(kind in catalogs && catalogs[kind].includes(oldValue), "Không tìm thấy mục danh mục");
      assert(newValue && newValue.length <= 120 && reason.length >= 3, "Tên mới hoặc lý do không hợp lệ");
      assert(!catalogs[kind].includes(newValue), "Tên danh mục mới đã tồn tại");
      catalogs[kind] = catalogs[kind].map((value) => value === oldValue ? newValue : value) as never;
      const customerFields: Partial<Record<keyof typeof defaultCatalogs, "district"|"storeType"|"route"|"frequency">> = { districts: "district", storeTypes: "storeType", routes: "route", frequencies: "frequency" };
      const productFields: Partial<Record<keyof typeof defaultCatalogs, "brand"|"group"|"unit">> = { brands: "brand", groups: "group", units: "unit" };
      const customerField = customerFields[kind];
      if (customerField) for (const customer of s.customers) if (customer[customerField] === oldValue) customer[customerField] = newValue;
      const productField = productFields[kind];
      if (productField) for (const product of s.products) if (product[productField] === oldValue) product[productField] = newValue;
      s.catalogs = catalogs;
      audit(s, command.type, `${kind}:${oldValue}`, JSON.stringify({ newValue, reason }));
      break;
    }
    case "saveOrder": {
      const x = p.order ?? p;
      found(s.customers, x.customerId);
      const old = x.id ? found(s.orders, x.id) : undefined;
      assert(!old || old.status === "draft", "Chỉ được sửa trực tiếp toa nháp");
      const item: Order = {
        id: old?.id ?? id(),
        code:
          old?.code ??
          "TC-" +
            String(
              s.audit.filter((a) => a.type === "saveOrder").length + 1,
            ).padStart(5, "0"),
        customerId: x.customerId,
        date: validDate(x.date ?? date()),
        notes: String(x.notes ?? ""),
        status: "draft",
        lines: parseOrderLines(s, x.lines, !!x.historical),
        total: "0",
        margin: null,
        reserved: "0",
        version: (old?.version ?? 0) + 1,
        historical: !!x.historical,
      };
      orderValues(item);
      if (old) Object.assign(old, item);
      else s.orders.push(item);
      break;
    }
    case "reviseOrder": {
      const o = found(s.orders, p.order?.id);
      reviseOrder(s, o, p.order, String(p.reason ?? ""), actor);
      break;
    }
    case "confirmOrder": {
      const o = found(s.orders, p.id);
      assert(o.status === "draft", "Toa không còn ở trạng thái nháp");
      for (const l of o.lines) {
        const prod = found(s.products, l.productId);
        l.cost = prod.cost;
        l.ceiling = prod.price;
        l.pack = prod.pack;
        if (!o.historical && l.kind === "sale") {
          assert(
            prod.price !== null && D(l.price).lte(prod.price),
            "Giá chào đã thay đổi, hãy sửa lại đơn",
            "PRICE_CEILING",
          );
        }
      }
      orderValues(o);
      assert(o.margin !== null, "Cần bổ sung giá vốn hàng/quà trước khi chốt");
      stockCheck(s, o.lines, o.id);
      reserveOrder(s, o);
      o.status = "confirmed";
      o.version++;
      break;
    }
    case "deleteOrder": {
      deleteOrder(s, found(s.orders, p.id), String(p.reason ?? ""), actor);
      break;
    }
    case "restoreOrder": {
      restoreOrder(s, found(s.orders, p.id), String(p.reason ?? ""), actor);
      break;
    }
    case "purgeOrder": {
      purgeOrder(s, found(s.orders, p.id), String(p.reason ?? ""), actor);
      break;
    }
    case "cancelOrder": {
      const o = found(s.orders, p.id);
      assert(String(p.reason ?? "").trim(), "Cần lý do hủy");
      assert(
        o.status !== "delivered",
        "Toa đã giao đủ: sử dụng nghiệp vụ trả hàng",
      );
      o.status = "cancelled";
      o.cancelReason = p.reason;
      o.reserved = "0";
      o.version++;
      break;
    }
    case "recordDelivery": {
      const o = found(s.orders, p.orderId);
      assert(
        ["confirmed", "partial"].includes(o.status),
        "Chỉ giao toa đã chốt",
      );
      assert(Array.isArray(p.lines) && p.lines.length, "Chọn hàng thực giao");
      const seen = new Set();
      const dl = p.lines.map((x: any) => {
        assert(!seen.has(x.lineId), "Trùng dòng giao");
        seen.add(x.lineId);
        const l = found(o.lines, x.lineId);
        const q = positiveQuantity(x.quantity);
        assert(q <= l.quantity - l.delivered, "Số giao vượt phần còn lại");
        const inv = s.inventory.find((i) => i.productId === l.productId);
        if (inv?.tracked) {
          assert(inv.quantity >= q, "Tồn thực tế không đủ");
          inv.quantity -= q;
          inv.updatedAt = new Date().toISOString();
          s.inventoryMovements.push({
            id: id(),
            productId: l.productId,
            date: validDate(p.date ?? date()),
            quantity: -q,
            reason: l.kind === "sale" ? "Giao hàng" : "Giao quà",
            referenceId: o.id,
          });
        }
        const previous = l.delivered;
        l.delivered += q;
        return {
          lineId: l.id,
          quantity: q,
          revenue: money(
            D(money(lineRevenue(l, l.delivered))).minus(
              money(lineRevenue(l, previous)),
            ),
          ),
          margin:
            lineMargin(l, q) === null
              ? null
              : money(
                  D(money(lineMargin(l, l.delivered)!)).minus(
                    money(lineMargin(l, previous)!),
                  ),
                ),
        };
      });
      const d = {
        id: id(),
        code: "GH-" + String(s.deliveries.length + 1).padStart(5, "0"),
        orderId: o.id,
        date: validDate(p.date ?? date()),
        lines: dl,
        total: money(sum(dl.map((l: any) => l.revenue))),
        margin: dl.some((l: any) => l.margin === null)
          ? null
          : money(sum(dl.map((l: any) => l.margin))),
        notes: String(p.notes ?? ""),
      };
      s.deliveries.push(d);
      if (d.margin !== null)
        s.ledger.push({
          id: id(),
          date: d.date,
          type: "delivery",
          amount: d.margin,
          referenceId: d.id,
          notes: "Quỹ hàng thực giao " + d.code,
        });
      o.status = o.lines.every((l) => l.delivered === l.quantity)
        ? "delivered"
        : "partial";
      reserveOrder(s, o);
      o.version++;
      break;
    }
    case "recordReturn": {
      const d = found(s.deliveries, p.deliveryId);
      const o = found(s.orders, d.orderId);
      assert(String(p.reason ?? "").trim(), "Cần lý do trả hàng");
      assert(Array.isArray(p.lines) && p.lines.length, "Chọn hàng trả");
      const seen = new Set();
      const rl = p.lines.map((x: any) => {
        assert(!seen.has(x.lineId), "Trùng dòng trả");
        seen.add(x.lineId);
        const l = found(o.lines, x.lineId);
        const original = d.lines.find((y) => y.lineId === l.id);
        assert(original, "Dòng hàng không thuộc phiếu giao");
        const prev = s.returns
          .filter((r) => r.deliveryId === d.id)
          .flatMap((r) => r.lines)
          .filter((y) => y.lineId === l.id)
          .reduce((a, y) => a + y.quantity, 0);
        const q = positiveQuantity(x.quantity);
        assert(q <= original.quantity - prev, "Số trả vượt số đã giao còn lại");
        l.returned += q;
        const inv = s.inventory.find((i) => i.productId === l.productId);
        if (x.restock && inv?.tracked) {
          inv.quantity += q;
          s.inventoryMovements.push({
            id: id(),
            productId: l.productId,
            date: validDate(p.date ?? date()),
            quantity: q,
            reason: "Nhận hàng trả",
            referenceId: d.id,
          });
        }
        return {
          lineId: l.id,
          quantity: q,
          restock: !!x.restock,
          revenue: money(
            D(
              money(
                D(original.revenue)
                  .times(prev + q)
                  .div(original.quantity),
              ),
            ).minus(
              money(D(original.revenue).times(prev).div(original.quantity)),
            ),
          ),
          margin:
            original.margin === null
              ? null
              : money(
                  D(
                    money(
                      D(original.margin)
                        .times(prev + q)
                        .div(original.quantity),
                    ),
                  ).minus(
                    money(
                      D(original.margin).times(prev).div(original.quantity),
                    ),
                  ),
                ),
        };
      });
      const r = {
        id: id(),
        deliveryId: d.id,
        orderId: o.id,
        date: validDate(p.date ?? date()),
        lines: rl,
        reason: p.reason,
      };
      s.returns.push(r);
      if (!rl.some((l: any) => l.margin === null))
        s.ledger.push({
          id: id(),
          date: r.date,
          type: "return",
          amount: money(sum(rl.map((l: any) => l.margin)).neg()),
          referenceId: r.id,
          notes: p.reason,
        });
      break;
    }
    case "recordPayment": {
      const o = found(s.orders, p.orderId);
      assert(D(p.amount).gt(0), "Tiền thu phải lớn hơn 0");
      s.payments.push({
        id: id(),
        orderId: o.id,
        date: validDate(p.date ?? date()),
        amount: money(p.amount),
        notes: String(p.notes ?? ""),
      });
      break;
    }
    case "adjustInventory": {
      found(s.products, p.productId);
      assert(Number.isSafeInteger(p.quantity), "Tồn kho phải là số nguyên");
      assert(String(p.reason ?? "").trim(), "Cần lý do điều chỉnh tồn");
      let inv = s.inventory.find((i) => i.productId === p.productId);
      if (!inv) {
        inv = {
          productId: p.productId,
          quantity: 0,
          tracked: p.tracked !== false,
          updatedAt: "",
          source: "",
        };
        s.inventory.push(inv);
      }
      const target =
        p.mode === "delta" ? inv.quantity + p.quantity : p.quantity;
      assert(target >= 0, "Tồn không được âm");
      assert(
        target >= reservedStock(s, p.productId),
        "Tồn mới thấp hơn lượng đang giữ",
      );
      const delta = target - inv.quantity;
      inv.quantity = target;
      inv.tracked = p.tracked !== false;
      inv.updatedAt = new Date().toISOString();
      inv.source = p.reason;
      s.inventoryMovements.push({
        id: id(),
        productId: p.productId,
        date: date(),
        quantity: delta,
        reason: p.reason,
        referenceId: "",
      });
      break;
    }
    case "openingBalance":
    case "adjustFund": {
      assert(String(p.notes ?? "").trim(), "Cần ghi chú nguồn tiền");
      if (command.type === "openingBalance")
        assert(
          !s.ledger.some((l) => l.type === "opening"),
          "Đã có số dư đầu kỳ, hãy dùng điều chỉnh",
        );
      s.ledger.push({
        id: id(),
        date: validDate(p.date ?? date()),
        type: command.type === "openingBalance" ? "opening" : "adjustment",
        amount: money(
          p.mode === "balance" ? D(p.amount).minus(s.summary.fund) : p.amount,
        ),
        referenceId: "",
        notes: p.notes,
      });
      break;
    }
    case "recordVisit":
      found(s.customers, p.customerId);
      s.visits.push({
        id: id(),
        customerId: p.customerId,
        date: validDate(p.date ?? date()),
        notes: String(p.notes ?? ""),
      });
      break;
    case "updateSettings": {
      const x = p.settings ?? p;
      const allowed = [
        "displayName",
        "dailyTarget",
        "monthlyTarget",
        "newCustomerTarget",
        "aso",
        "theme",
        "workDays",
        "holidays",
        "focusProduct",
        "periodStart",
        "openingSales",
        "reportGroups",
        "route",
      ];
      for (const key of allowed)
        if (x[key] !== undefined) s.settings[key] = x[key];
      for (const k of ["dailyTarget", "monthlyTarget", "openingSales"]) {
        assert(D(s.settings[k]).gte(0), "Chỉ tiêu không được âm");
        s.settings[k] = money(s.settings[k]);
      }
      break;
    }
    case "reserveProgram": {
      const ls = parseOrderLines(s, p.lines);
      assert(
        ls.every((l) => l.cost !== null),
        "Chương trình có hàng/quà chưa có giá vốn",
      );
      const count = positiveQuantity(p.count);
      const margin = sum(ls.map((l) => lineMargin(l)!));
      const subsidy = Decimal.max(0, margin.neg());
      assert(subsidy.lte(200000), "Vượt 200.000đ hỗ trợ cho một suất");
      assert(
        subsidy.eq(0) || p.allowSubsidy === true,
        "Cần bật sử dụng quỹ hiện có",
      );
      refresh(s);
      assert(
        D(s.summary.available).gte(subsidy.times(count)),
        "Không đủ quỹ khả dụng cho số suất",
        "INSUFFICIENT_FUND",
      );
      if (p.guaranteeStock) {
        assert(
          ls.every(
            (l) =>
              s.inventory.find((i) => i.productId === l.productId)?.tracked,
          ),
          "Cần cập nhật và theo dõi tồn để bảo đảm hàng",
        );
        stockCheck(s, ls, undefined, undefined, count);
      }
      s.programs.push({
        id: id(),
        name: String(p.name ?? "Chương trình mới"),
        mode: p.mode === "single" ? "single" : "bundle",
        lines: ls,
        count,
        remaining: count,
        price: money(sum(ls.map((l) => lineRevenue(l)))),
        margin: money(margin),
        subsidy: money(subsidy),
        reserved: money(subsidy.times(count)),
        guaranteeStock: !!p.guaranteeStock,
        status: "active",
        expiresAt: validDate(p.expiresAt ?? date()),
        seed: Number(p.seed ?? 1),
      });
      break;
    }
    case "cancelProgram": {
      const prog = found(s.programs, p.id);
      prog.status = "cancelled";
      prog.reserved = "0";
      break;
    }
    case "applyProgram": {
      const prog = found(s.programs, p.id);
      assert(
        prog.status === "active" && prog.expiresAt >= date(),
        "Chương trình hết hiệu lực",
      );
      const count = positiveQuantity(p.count ?? 1);
      assert(count <= prog.remaining, "Vượt số suất còn lại");
      found(s.customers, p.customerId);
      for (const l of prog.lines) {
        const prod = found(s.products, l.productId);
        assert(
          prod.cost === l.cost && prod.price === l.ceiling,
          "Bảng giá đã thay đổi, hãy tạo lại chương trình",
          "STALE_PRICE",
        );
      }
      prog.remaining -= count;
      prog.reserved = money(D(prog.subsidy).times(prog.remaining));
      const o: Order = {
        id: id(),
        code: "TC-" + String(s.orders.length + 1).padStart(5, "0"),
        customerId: p.customerId,
        date: validDate(p.date ?? date()),
        notes: prog.name,
        status: "confirmed",
        lines: prog.lines.map((l) => ({
          ...l,
          id: id(),
          quantity: l.quantity * count,
          discount: D(l.discount).times(count).toFixed(),
        })),
        total: money(D(prog.price).times(count)),
        margin: money(D(prog.margin).times(count)),
        reserved: "0",
        version: 1,
        programId: prog.id,
        bundleCount: count,
      };
      stockCheck(s, o.lines);
      reserveOrder(s, o);
      s.orders.push(o);
      break;
    }
    case "expirePrograms":
      for (const prog of s.programs)
        if (prog.status === "active" && prog.expiresAt < date()) {
          prog.status = "expired";
          prog.reserved = "0";
        }
      break;
    default:
      throw new DomainError("UNKNOWN_COMMAND", "Thao tác chưa được hỗ trợ");
  }
  if (command.type === "recordDelivery") {
    const d = s.deliveries.at(-1)!;
    const topUp = D(p.exchangeTopUp ?? 0);
    assert(topUp.isFinite(), "Bù chênh đổi không hợp lệ");
    d.exchangeTopUp = money(topUp);
    d.lines = d.lines.map((line) => {
      const orderLine = found(
        s.orders.find((o) => o.id === d.orderId)!.lines,
        line.lineId,
      );
      return {
        ...line,
        employeeSales:
          orderLine.cost !== null
            ? money(D(orderLine.cost).times(line.quantity))
            : "0",
      };
    });
    d.employeeSales = money(
      sum(d.lines.map((line) => line.employeeSales ?? 0)),
    );
    const entry = s.ledger.find(
      (line) => line.referenceId === d.id && line.type === "delivery",
    );
    if (entry && d.margin !== null) {
      entry.amount = money(D(d.margin).plus(topUp));
      entry.notes =
        "Quỹ hàng thực giao " + d.code + (topUp.eq(0) ? "" : " + bù chênh đổi");
    }
  }
  s.version++;
  audit(
    s,
    command.type,
    String(p.id ?? p.orderId ?? ""),
    JSON.stringify({
      actorId: actor?.id,
      reason: p.reason ?? p.notes ?? "",
      message: "Thao tác được ghi nhận nguyên tử",
    }),
  );
  return refresh(s);
}

export function previewPrograms(s: AppState, p: any) {
  let seed = Number(p.seed ?? Date.now()) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const excluded = new Set(p.excludedIds ?? []);
  const eligible = s.products.filter(
    (x) =>
      !x.archived && x.cost !== null && x.price !== null && !excluded.has(x.id),
  );
  const count = Math.min(5, Math.max(1, Number(p.options ?? 5)));
  const results: any[] = [];
  const signatures = new Set<string>();
  for (let attempt = 0; attempt < 2000 && results.length < count; attempt++) {
    const maxTypes =
      p.mode === "single"
        ? 1
        : Math.max(1, Math.min(Number(p.maxTypes ?? 3), eligible.length));
    const chosen = [
      ...new Set([
        ...(p.requiredIds ?? []),
        ...[...eligible]
          .sort(() => random() - 0.5)
          .slice(0, maxTypes)
          .map((x) => x.id),
      ]),
    ];
    if (!chosen.length) break;
    const ls = chosen.map((productId) => {
      const prod = found(eligible, productId);
      const min = Math.max(1, Number(p.minQuantity ?? 1));
      const max = Math.max(min, Number(p.maxQuantity ?? 6));
      return {
        productId,
        quantity:
          (min + Math.floor(random() * (max - min + 1))) *
          (p.fullCases ? prod.pack : 1),
        price: D(prod.price!)
          .times(D(100).minus(p.discountPercent ?? 0))
          .div(100)
          .toFixed(),
        kind: "sale",
        sponsor: "employee",
        discount: "0",
      };
    });
    if (Array.isArray(p.gifts))
      ls.push(
        ...p.gifts.map((g: any) => ({
          ...g,
          price: "0",
          kind: "gift",
          discount: "0",
        })),
      );
    try {
      const parsed = parseOrderLines(s, ls).map((l, i) => ({
        ...l,
        id: "preview-" + attempt + "-" + i,
      }));
      assert(
        parsed.every((l) => l.cost !== null),
        "Thiếu giá vốn",
      );
      const total = sum(parsed.map((l) => lineRevenue(l)));
      const margin = sum(parsed.map((l) => lineMargin(l)!));
      const subsidy = Decimal.max(0, margin.neg());
      if (
        subsidy.gt(
          p.allowSubsidy ? Math.min(200000, Number(p.maxSubsidy ?? 200000)) : 0,
        ) ||
        subsidy.times(p.count ?? 1).gt(s.summary.available) ||
        margin.lt(p.minimumMargin ?? -200000)
      )
        continue;
      if (p.targetPrice && total.gt(D(p.targetPrice).times(1.15))) continue;
      if (p.guaranteeStock)
        stockCheck(s, parsed, undefined, undefined, p.count ?? 1);
      const sig = JSON.stringify(ls);
      if (signatures.has(sig)) continue;
      signatures.add(sig);
      results.push({
        lines: parsed,
        total: money(total),
        margin: money(margin),
        subsidy: money(subsidy),
        seed,
        inventoryChecked: !!p.guaranteeStock,
      });
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }
  return {
    options: results.sort((a, b) => D(a.subsidy).cmp(b.subsidy)),
    message: results.length
      ? "Phương án được kiểm tra theo bảng giá hiện tại. Chưa giữ quỹ."
      : "Chưa tìm được phương án trong 2.000 ứng viên. Thử giảm quà/chiết khấu hoặc đổi phối hợp.",
    seed,
  };
}
