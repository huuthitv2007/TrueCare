import type { AppState, Customer, Product } from "../shared/types.js";
import { defaultCatalogs, type Catalogs, type CatalogEntry } from "../shared/catalogs.js";
export interface Directory {
  products: Product[];
  customers: Customer[];
  catalogs: Catalogs;
  catalogEntries?: CatalogEntry[];
}
export const emptyDirectory = (): Directory => ({
  products: [],
  customers: [],
  catalogs: structuredClone(defaultCatalogs),
});
export function directoryOf(s: AppState): Directory {
  return {
    products: s.products,
    customers: s.customers,
    catalogs: s.catalogs ?? structuredClone(defaultCatalogs),
    catalogEntries: s.catalogEntries,
  };
}
export function attachDirectory(
  s: AppState,
  data: Directory,
  version: number,
): AppState {
  return { ...s, ...data, sharedVersion: version };
}
/** Mirrors migration 009: archive is no longer a customer lifecycle state. */
export function reactivateArchivedCustomers(customers: Customer[]) {
  let restored = 0;
  const next = customers.map((customer) => {
    if (!customer.archived || customer.deletedAt || customer.mergedInto) return customer;
    restored += 1;
    return { ...customer, archived: false };
  });
  return { customers: next, restored };
}
/** Preserve every original identity, including equal names/codes with different prices. */
export function migrateDirectory(states: { owner: string; state: AppState }[]) {
  const directory = emptyDirectory();
  for (const { owner, state } of states) {
    const products = new Map(
      state.products.map((p) => [p.id, owner + ":" + p.id]),
    );
    const customers = new Map(
      state.customers.map((c) => [c.id, owner + ":" + c.id]),
    );
    for (const p of state.products)
      directory.products.push({ ...p, id: products.get(p.id)! });
    for (const c of state.customers)
      directory.customers.push({
        ...c,
        id: customers.get(c.id)!,
        legacyLocked: !c.createdBy || !c.createdAt,
      });
    for (const o of state.orders) {
      o.customerId = customers.get(o.customerId) ?? o.customerId;
      for (const l of o.lines)
        l.productId = products.get(l.productId) ?? l.productId;
    }
    for (const p of state.programs)
      for (const l of p.lines)
        l.productId = products.get(l.productId) ?? l.productId;
    for (const i of [...state.inventory, ...state.inventoryMovements])
      i.productId = products.get(i.productId) ?? i.productId;
    for (const v of state.visits)
      v.customerId = customers.get(v.customerId) ?? v.customerId;
    state.products = [];
    state.customers = [];
  }
  return { directory, states };
}
