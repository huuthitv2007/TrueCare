import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import type { AppState, Order, OrderRevision } from "../shared/types.js";
import {
  assert,
  reservedStock,
  parseOrderLines,
  lineRevenue,
  lineMargin,
  refresh,
} from "./domain.js";

export interface Actor {
  id: string;
  role: "employee" | "admin";
  now?: string;
}
export function orderSnapshot(o: Order): OrderRevision["before"] {
  return structuredClone({
    customerId: o.customerId,
    date: o.date,
    notes: o.notes,
    status: o.status,
    lines: o.lines,
    total: o.total,
    margin: o.margin,
  });
}
export function revision(
  o: Order,
  before: OrderRevision["before"],
  reason: string,
  actor?: Actor,
) {
  (o.revisions ??= []).push({
    id: randomUUID(),
    at: actor?.now ?? new Date().toISOString(),
    actorId: actor?.id,
    reason,
    before,
    after: orderSnapshot(o),
  });
}
export function deletionImpact(s: AppState, o: Order) {
  const deliveries = s.deliveries.filter((d) => d.orderId === o.id),
    returns = s.returns.filter((r) => r.orderId === o.id);
  const refs = new Set([
    ...deliveries.map((d) => d.id),
    ...returns.map((r) => r.id),
  ]);
  const entries = s.ledger.filter((e) => refs.has(e.referenceId));
  const movementRefs = new Set([o.id, ...deliveries.map((d) => d.id)]);
  const quantities = new Map<string, number>();
  for (const m of s.inventoryMovements.filter((m) =>
    movementRefs.has(m.referenceId),
  ))
    quantities.set(
      m.productId,
      (quantities.get(m.productId) ?? 0) - m.quantity,
    );
  return {
    entries,
    stock: [...quantities]
      .filter(([, quantity]) => quantity !== 0)
      .map(([productId, quantity]) => ({ productId, quantity })),
    fund: entries.reduce((a, e) => a.plus(e.amount), new Decimal(0)).toFixed(0),
    payments: s.payments
      .filter((p) => p.orderId === o.id)
      .reduce((a, p) => a.plus(p.amount), new Decimal(0))
      .toFixed(0),
  };
}
export function reviseOrder(
  s: AppState,
  o: Order,
  input: any,
  reason: string,
  actor?: Actor,
) {
  assert(reason.trim(), "Cần lý do sửa toa đã chốt");
  assert(!o.deletedAt && o.status !== "cancelled", "Không sửa toa đã huỷ/xoá");
  const before = orderSnapshot(o),
    oldStock = deletionImpact(s, o).stock;
  const next = parseOrderLines(s, input.lines, true);
  assert(
    new Set(next.map((l) => l.id)).size === next.length,
    "Trùng mã dòng hàng",
  );
  for (const l of next) {
    const old = o.lines.find(
      (x) => x.id === l.id && x.productId === l.productId,
    );
    if (old) {
      l.cost = old.cost;
      l.ceiling = old.ceiling;
      l.pack = old.pack;
      l.unit = old.unit;
      l.name = old.name;
    }
    assert(l.cost !== null, "Cần đủ giá gốc để sửa toa đã chốt");
    assert(
      l.kind !== "sale" ||
        (l.ceiling !== null && new Decimal(l.price).lte(l.ceiling)),
      "Giá bán vượt giá chào tại chứng từ",
      "PRICE_CEILING",
    );
  }
  const deliveries = s.deliveries.filter((d) => d.orderId === o.id);
  for (const old of o.lines.filter((l) => l.returned > 0)) {
    const same = next.find((l) => l.id === old.id);
    assert(
      same && same.productId === old.productId && same.kind === old.kind,
      "Dòng đã có hàng trả phải giữ sản phẩm và loại dòng để truy chứng từ",
    );
  }
  if (deliveries.length) {
    assert(
      Array.isArray(input.deliveries) &&
        input.deliveries.length === deliveries.length,
      "Nhập rõ thực giao mới cho từng phiếu giao",
    );
    assert(
      new Set(input.deliveries.map((d: any) => d.id)).size ===
        deliveries.length,
      "Trùng phiếu thực giao",
    );
  }
  const round = (n: Decimal.Value) =>
    new Decimal(n).toDecimalPlaces(0).toFixed(0);
  const sum = (xs: Decimal.Value[]) =>
    xs.reduce<Decimal>((a, x) => a.plus(x), new Decimal(0));
  const correctLedger = (
    referenceId: string,
    date: string,
    amount: Decimal.Value,
  ) => {
    const prior = sum(
      s.ledger
        .filter((e) => e.referenceId === referenceId)
        .map((e) => e.amount),
    );
    const delta = new Decimal(amount).minus(prior);
    if (!delta.isZero())
      s.ledger.push({
        id: randomUUID(),
        date,
        type: "adjustment",
        amount: round(delta),
        referenceId,
        notes: "Sửa " + o.code + ": " + reason,
      });
  };
  for (const d of deliveries) {
    const patch = input.deliveries.find((x: any) => x.id === d.id);
    assert(patch && Array.isArray(patch.lines), "Thiếu thực giao mới");
    assert(
      new Set(patch.lines.map((x: any) => x.lineId)).size ===
        patch.lines.length,
      "Trùng dòng thực giao",
    );
    d.lines = patch.lines.map((part: any) => {
      const l = next.find((l) => l.id === part.lineId);
      assert(l, "Dòng thực giao không thuộc toa mới");
      const q = part.quantity;
      assert(
        Number.isSafeInteger(q) && q >= 0 && q <= 1000000,
        "Số thực giao phải là số nguyên không âm",
      );
      const returned = s.returns
        .filter((r) => r.deliveryId === d.id)
        .flatMap((r) => r.lines)
        .filter((r) => r.lineId === l.id)
        .reduce((a, r) => a + r.quantity, 0);
      assert(q >= returned, "Thực giao mới thấp hơn số đã trả");
      const previous = l.delivered;
      l.delivered += q;
      return {
        lineId: l.id,
        quantity: q,
        revenue: round(
          new Decimal(round(lineRevenue(l, l.delivered))).minus(
            round(lineRevenue(l, previous)),
          ),
        ),
        employeeSales: round(new Decimal(l.cost!).times(q)),
        margin: round(
          new Decimal(round(lineMargin(l, l.delivered)!)).minus(
            round(lineMargin(l, previous)!),
          ),
        ),
      };
    });
    for (const r of s.returns.filter((r) => r.deliveryId === d.id))
      for (const p of r.lines)
        assert(
          d.lines.some(
            (l) => l.lineId === p.lineId && l.quantity >= p.quantity,
          ),
          "Không bỏ dòng có hàng trả",
        );
    d.total = round(sum(d.lines.map((l) => l.revenue)));
    d.employeeSales = round(sum(d.lines.map((l) => l.employeeSales!)));
    d.margin = round(sum(d.lines.map((l) => l.margin!)));
    correctLedger(
      d.id,
      d.date,
      new Decimal(d.margin).plus(d.exchangeTopUp ?? 0),
    );
  }
  for (const l of next)
    assert(l.delivered <= l.quantity, "Số đặt mới thấp hơn tổng thực giao");
  for (const r of s.returns.filter((r) => r.orderId === o.id)) {
    for (const part of r.lines) {
      const l = next.find((l) => l.id === part.lineId)!;
      const original = deliveries
        .find((d) => d.id === r.deliveryId)!
        .lines.find((x) => x.lineId === part.lineId)!;
      const preceding = s.returns
        .slice(0, s.returns.indexOf(r))
        .filter((x) => x.deliveryId === r.deliveryId)
        .flatMap((x) => x.lines)
        .filter((x) => x.lineId === part.lineId)
        .reduce((a, x) => a + x.quantity, 0);
      const prorate = (n: string) =>
        round(
          new Decimal(
            round(
              new Decimal(n)
                .times(preceding + part.quantity)
                .div(original.quantity),
            ),
          ).minus(
            round(new Decimal(n).times(preceding).div(original.quantity)),
          ),
        );
      part.revenue = prorate(original.revenue);
      part.margin = prorate(original.margin!);
      part.employeeSales = round(new Decimal(l.cost!).times(part.quantity));
      l.returned += part.quantity;
    }
    correctLedger(r.id, r.date, sum(r.lines.map((l) => l.margin!)).neg());
  }
  const now = actor?.now ?? new Date().toISOString();
  const oldQuantity = new Map(oldStock.map((x) => [x.productId, x.quantity]));
  const newQuantity = new Map<string, number>();
  for (const l of next) {
    const restocked = s.returns
      .filter((r) => r.orderId === o.id)
      .flatMap((r) => r.lines)
      .filter((p) => p.lineId === l.id && p.restock)
      .reduce((a, p) => a + p.quantity, 0);
    newQuantity.set(
      l.productId,
      (newQuantity.get(l.productId) ?? 0) + l.delivered - restocked,
    );
  }
  for (const productId of new Set([
    ...oldQuantity.keys(),
    ...newQuantity.keys(),
  ])) {
    const inv = s.inventory.find((i) => i.productId === productId);
    if (!inv?.tracked) continue;
    const delta =
      (oldQuantity.get(productId) ?? 0) - (newQuantity.get(productId) ?? 0);
    assert(
      inv.quantity + delta >= reservedStock(s, productId, o.id),
      "Không đủ tồn cho thực giao mới",
      "INSUFFICIENT_STOCK",
    );
    inv.quantity += delta;
    inv.updatedAt = now;
    if (delta)
      s.inventoryMovements.push({
        id: randomUUID(),
        productId,
        date: now.slice(0, 10),
        quantity: delta,
        reason: "Sửa toa: " + reason,
        referenceId: o.id,
      });
  }
  o.lines = next;
  o.notes = String(input.notes ?? o.notes);
  assert(
    s.customers.some((c) => c.id === input.customerId && !c.archived),
    "Khách hàng không còn kinh doanh",
  );
  o.customerId = input.customerId;
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(input.date) &&
      !Number.isNaN(Date.parse(input.date)) &&
      new Date(input.date).toISOString().slice(0, 10) === input.date,
    "Ngày không hợp lệ",
  );
  o.date = input.date;
  o.total = round(sum(next.map((l) => lineRevenue(l))));
  o.margin = round(sum(next.map((l) => lineMargin(l)!)));
  o.status = next.every((l) => l.delivered === l.quantity)
    ? "delivered"
    : next.some((l) => l.delivered > 0)
      ? "partial"
      : "confirmed";
  o.reserved = round(
    Decimal.max(
      0,
      sum(next.map((l) => lineMargin(l, l.quantity - l.delivered)!)).neg(),
    ),
  );
  o.version++;
  revision(o, before, reason, actor);
  refresh(s);
}
export function deleteOrder(
  s: AppState,
  o: Order,
  reason: string,
  actor?: Actor,
) {
  assert(reason.trim(), "Cần lý do xoá toa");
  assert(!o.deletedAt, "Toa đã ở thùng tạm giữ", "CONFLICT");
  const before = orderSnapshot(o),
    impact = deletionImpact(s, o);
  const now = actor?.now ?? new Date().toISOString();
  const reversalIds: string[] = [];
  for (const e of impact.entries) {
    const id = randomUUID();
    reversalIds.push(id);
    s.ledger.push({
      id,
      date: e.date,
      type: "adjustment",
      amount: new Decimal(e.amount).neg().toFixed(0),
      referenceId: "delete:" + o.id,
      notes: "Đảo " + o.code + ": " + reason,
    });
  }
  for (const delta of impact.stock) {
    const inv = s.inventory.find((i) => i.productId === delta.productId);
    assert(inv, "Không tìm thấy kho cần hoàn");
    assert(inv.quantity + delta.quantity >= 0, "Hoàn kho tạo số tồn âm");
    inv.quantity += delta.quantity;
    inv.updatedAt = now;
    s.inventoryMovements.push({
      id: randomUUID(),
      productId: delta.productId,
      date: now.slice(0, 10),
      quantity: delta.quantity,
      reason: "Xoá toa: " + reason,
      referenceId: "delete:" + o.id,
    });
  }
  o.deletion = {
    stock: impact.stock,
    reversals: reversalIds,
    reserved: o.reserved,
  };
  o.deletedAt = now;
  o.deletedBy = actor?.id;
  o.deletionReason = reason;
  o.statusBeforeDelete = o.status;
  o.reserved = "0";
  o.version++;
  revision(o, before, reason, actor);
}
export function restoreOrder(
  s: AppState,
  o: Order,
  reason: string,
  actor?: Actor,
) {
  assert(actor?.role === "admin", "Chỉ admin được khôi phục toa", "FORBIDDEN");
  assert(reason.trim(), "Cần lý do khôi phục");
  assert(
    o.deletedAt && o.deletion && !o.purgedAt,
    "Toa không còn trong thùng tạm giữ",
    "CONFLICT",
  );
  const before = orderSnapshot(o),
    deletion = o.deletion;
  const now = actor.now ?? new Date().toISOString();
  for (const delta of deletion.stock) {
    const inv = s.inventory.find((i) => i.productId === delta.productId);
    assert(
      inv &&
        inv.quantity - delta.quantity >=
          reservedStock(s, delta.productId, o.id),
      "Không đủ tồn để khôi phục toa",
      "INSUFFICIENT_STOCK",
    );
  }
  const reversal = s.ledger.filter((e) => deletion.reversals.includes(e.id));
  const restoredFund = new Decimal(s.summary.fund).minus(
    reversal.reduce((a, e) => a.plus(e.amount), new Decimal(0)),
  );
  assert(
    restoredFund.minus(s.summary.reserved).gte(deletion.reserved),
    "Không đủ ngân sách để khôi phục toa",
    "INSUFFICIENT_FUND",
  );
  for (const delta of deletion.stock) {
    const inv = s.inventory.find((i) => i.productId === delta.productId)!;
    inv.quantity -= delta.quantity;
    inv.updatedAt = now;
    s.inventoryMovements.push({
      id: randomUUID(),
      productId: delta.productId,
      date: now.slice(0, 10),
      quantity: -delta.quantity,
      reason: "Khôi phục toa: " + reason,
      referenceId: "restore:" + o.id,
    });
  }
  for (const e of reversal)
    s.ledger.push({
      id: randomUUID(),
      date: e.date,
      type: "adjustment",
      amount: new Decimal(e.amount).neg().toFixed(0),
      referenceId: "restore:" + o.id,
      notes: "Khôi phục " + o.code + ": " + reason,
    });
  o.reserved = deletion.reserved;
  o.status = o.statusBeforeDelete ?? o.status;
  delete o.deletedAt;
  delete o.deletedBy;
  delete o.deletionReason;
  delete o.deletion;
  delete o.statusBeforeDelete;
  o.version++;
  revision(o, before, reason, actor);
}
export function purgeOrder(
  s: AppState,
  o: Order,
  reason: string,
  actor?: Actor,
) {
  assert(actor?.role === "admin", "Chỉ admin được xoá hoàn toàn", "FORBIDDEN");
  assert(reason.trim(), "Cần lý do xoá hoàn toàn");
  assert(
    o.deletedAt && !o.purgedAt,
    "Toa phải nằm trong thùng tạm giữ",
    "CONFLICT",
  );
  assert(
    !s.payments.some((p) => p.orderId === o.id && new Decimal(p.amount).gt(0)),
    "Toa còn tiền đã thu cần xử lý; giữ trong thùng tạm giữ",
  );
  // Retain the accounting tombstone and ledger references; no second reversal.
  o.purgedAt = actor.now ?? new Date().toISOString();
  o.lines = [];
  o.notes = "";
  o.revisions = [];
  o.version++;
  s.deliveries = s.deliveries.filter((d) => d.orderId !== o.id);
  s.returns = s.returns.filter((r) => r.orderId !== o.id);
}
