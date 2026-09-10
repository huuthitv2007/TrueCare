import { randomUUID } from "node:crypto";
import type { AppState, Command } from "../shared/types.js";
import type { Actor } from "./order-lifecycle.js";
import type { ImportPreview } from "./imports.js";
import { assert, execute, refresh } from "./domain.js";

export function authorizeImport(kind: string, actor: Actor) {
  assert(
    actor.role === "admin" || kind === "orders",
    "Nhân viên chỉ được nhập toa bằng sản phẩm admin đã có",
    "FORBIDDEN",
  );
}
export function applyImport(
  state: AppState,
  command: Command,
  preview: ImportPreview,
  actor: Actor,
) {
  authorizeImport(preview.kind, actor);
  assert(
    !preview.issues.some((x) => x.severity === "error"),
    "Còn lỗi dữ liệu cần đối chiếu",
  );
  assert(
    !state.imports.some((x) => x.hash === preview.checksum),
    "Tệp đã được nhập",
    "DUPLICATE_IMPORT",
  );
  assert(
    command.version === state.version &&
      command.sharedVersion === state.sharedVersion,
    "Dữ liệu đã thay đổi",
    "CONFLICT",
  );
  let next = structuredClone(state);
  if (actor.role === "employee")
    assert(
      !preview.products.length,
      "Tệp nhập không được tạo hoặc sửa sản phẩm",
      "FORBIDDEN",
    );
  for (const product of preview.products)
    next = execute(
      next,
      { type: "saveProduct", payload: product, idempotencyKey: randomUUID() },
      actor,
    );
  const customers = new Map<string, string>();
  for (const customer of preview.customers) {
    const old = next.customers.find((c) => c.id === customer.id);
    if (old) {
      customers.set(customer.id, old.id);
      continue;
    }
    const sourceId = customer.id;
    next = execute(
      next,
      {
        type: "saveCustomer",
        payload: { ...customer, id: undefined },
        idempotencyKey: randomUUID(),
      },
      actor,
    );
    customers.set(sourceId, next.customers.at(-1)!.id);
  }
  for (const order of preview.orders) {
    assert(
      order.lines.every((l) =>
        next.products.some((p) => p.id === l.productId && !p.archived),
      ),
      "Toa có sản phẩm không thuộc danh mục đang kinh doanh",
    );
    next = execute(
      next,
      {
        type: "saveOrder",
        payload: {
          ...order,
          id: undefined,
          customerId: customers.get(order.customerId) ?? order.customerId,
          historical: true,
        },
        idempotencyKey: randomUUID(),
      },
      actor,
    );
  }
  next.imports.push({ hash: preview.checksum, at: new Date().toISOString() });
  next.audit.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    type: "commitImport",
    referenceId: preview.checksum,
    details: JSON.stringify({ actorId: actor.id, filename: preview.filename }),
  });
  next.version = state.version + 1;
  return refresh(next);
}
