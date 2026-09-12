import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, execute } from "../server/domain.js";
import { migrateDirectory, attachDirectory, reactivateArchivedCustomers } from "../server/shared-directory.js";

test("chuyển dữ liệu cũ sang danh mục chung giữ nguyên mọi liên kết và không gộp trùng tên", () => {
  const create = (owner: string) => {
    let state = emptyState(owner);
    state = execute(state, {
      type: "saveProduct",
      payload: { name: "Cùng tên", code: "SP", pack: 4, cost: "10", price: "12" },
      idempotencyKey: owner + "-product",
    });
    state = execute(state, {
      type: "saveCustomer",
      payload: { name: "Cùng khách" },
      idempotencyKey: owner + "-customer",
    });
    state = execute(state, {
      type: "saveOrder",
      payload: {
        customerId: state.customers[0].id,
        lines: [{ productId: state.products[0].id, quantity: 1, price: "12" }],
      },
      idempotencyKey: owner + "-order",
    });
    return { owner, state };
  };
  const migrated = migrateDirectory([create("a"), create("b")]);
  assert.equal(migrated.directory.products.length, 2);
  assert.equal(migrated.directory.customers.length, 2);
  assert.notEqual(migrated.directory.products[0].id, migrated.directory.products[1].id);
  for (const entry of migrated.states) {
    const attached = attachDirectory(entry.state, migrated.directory, 1);
    assert.ok(attached.products.some((p) => p.id === entry.state.orders[0].lines[0].productId));
    assert.ok(attached.customers.some((c) => c.id === entry.state.orders[0].customerId));
  }
});

test("khôi phục khách lưu trữ nhưng giữ nguyên khách trong thùng rác hoặc đã gộp", () => {
  const base = {
    id: "base", name: "Khách", contact: "", phone: "", email: "", address: "",
    street: "", ward: "", district: "", province: "", route: "", visitDays: [],
    frequency: "", storeType: "", notes: "", openedDate: "2026-09-11", archived: true,
  };
  const { customers, restored } = reactivateArchivedCustomers([
    { ...base, id: "archived" },
    { ...base, id: "deleted", deletedAt: "2026-09-11T00:00:00Z" },
    { ...base, id: "merged", mergedInto: "other" },
  ]);
  assert.equal(restored, 1);
  assert.equal(customers[0].archived, false);
  assert.equal(customers[1].archived, true);
  assert.equal(customers[2].archived, true);
});
