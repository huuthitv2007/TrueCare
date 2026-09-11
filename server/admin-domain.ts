import Decimal from "decimal.js";
import type { AppState, Customer, Product } from "../shared/types.js";

export interface OwnedState {
  ownerId: string;
  ownerName: string;
  state: AppState;
}

export function pageOf<T>(items: T[], page = 1, pageSize = 25) {
  const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize) || 25));
  const safePage = Math.max(1, Math.trunc(page) || 1);
  return {
    items: items.slice((safePage - 1) * safeSize, safePage * safeSize),
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    pages: Math.max(1, Math.ceil(items.length / safeSize)),
  };
}

export function customerUsage(states: OwnedState[], customerId: string) {
  return states.reduce(
    (usage, owned) => {
      const orders = owned.state.orders.filter((x) => x.customerId === customerId);
      const visits = owned.state.visits.filter((x) => x.customerId === customerId);
      usage.orders += orders.length;
      usage.visits += visits.length;
      usage.revenue = new Decimal(usage.revenue)
        .plus(
          owned.state.deliveries
            .filter((delivery) =>
              orders.some((order) => order.id === delivery.orderId),
            )
            .reduce((sum, delivery) => sum.plus(delivery.total), new Decimal(0)),
        )
        .toFixed(0);
      return usage;
    },
    { orders: 0, visits: 0, revenue: "0" },
  );
}

export function productUsage(states: OwnedState[], productId: string) {
  return states.reduce(
    (usage, owned) => {
      usage.orders += owned.state.orders.filter((order) =>
        order.lines.some((line) => line.productId === productId),
      ).length;
      usage.programs += owned.state.programs.filter((program) =>
        program.lines.some((line) => line.productId === productId),
      ).length;
      return usage;
    },
    { orders: 0, programs: 0 },
  );
}

export function duplicateCustomers(customers: Customer[]) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\W/g, "");
  const groups = new Map<string, Customer[]>();
  for (const customer of customers.filter((x) => !x.deletedAt && !x.mergedInto)) {
    const phone = customer.phone.replace(/\D/g, "");
    const key = phone.length >= 8 ? `phone:${phone}` : `name:${normalize(customer.name)}:${normalize(customer.address)}`;
    const rows = groups.get(key) ?? [];
    rows.push(customer);
    groups.set(key, rows);
  }
  return [...groups.values()].filter((rows) => rows.length > 1);
}

export function dashboardOf(states: OwnedState[], products: Product[]) {
  const now = Date.now();
  const orders = states.flatMap((owned) =>
    owned.state.orders.map((order) => ({ ...order, ownerId: owned.ownerId })),
  );
  const programs = states.flatMap((owned) =>
    owned.state.programs.map((program) => ({ ...program, ownerId: owned.ownerId })),
  );
  const inventory = states[0]?.state.inventory ?? [];
  return {
    employees: states.length,
    orders: orders.filter((x) => !x.deletedAt && !x.purgedAt).length,
    partialOrders: orders.filter((x) => !x.deletedAt && x.status === "partial").length,
    trashedOrders: orders.filter((x) => x.deletedAt && !x.purgedAt).length,
    unresolved: states.reduce((sum, x) => sum + x.state.summary.unresolved, 0),
    negativeFunds: states.filter((x) => new Decimal(x.state.summary.available).lt(0)).length,
    lowStock: inventory.filter((x) => x.tracked && x.quantity <= 12).length,
    expiringPrograms: programs.filter(
      (x) =>
        x.status === "active" &&
        Date.parse(x.expiresAt) >= now &&
        Date.parse(x.expiresAt) <= now + 7 * 86_400_000,
    ).length,
    duplicateCustomers: duplicateCustomers(states[0]?.state.customers ?? []).length,
    productsNeedingReview: products.filter((x) => !x.deletedAt && x.needsReview).length,
  };
}

export function catalogUsage(
  states: OwnedState[],
  products: Product[],
  customers: Customer[],
  kind: string,
  value: string,
) {
  if (kind === "districts") return customers.filter((x) => x.district === value).length;
  if (kind === "storeTypes") return customers.filter((x) => x.storeType === value).length;
  if (kind === "routes") return customers.filter((x) => x.route === value).length;
  if (kind === "frequencies") return customers.filter((x) => x.frequency === value).length;
  if (kind === "brands") return products.filter((x) => x.brand === value).length;
  if (kind === "groups") return products.filter((x) => x.group === value).length;
  if (kind === "units") return products.filter((x) => x.unit === value).length;
  if (kind === "visitDays") {
    const index = (states[0]?.state.catalogs?.visitDays ?? []).indexOf(value) + 1;
    return customers.filter((x) => x.visitDays.includes(index)).length;
  }
  return 0;
}
