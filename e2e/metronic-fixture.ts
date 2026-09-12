import type { Page } from "@playwright/test";
import { emptyState, execute } from "../server/domain";
import type { AppState } from "../shared/types";

export function sampleState() {
  let state = emptyState("Nguyễn Minh Anh");
  const run = (type: string, payload: unknown) => {
    state = execute(state, {
      type,
      payload,
      version: state.version,
      idempotencyKey: crypto.randomUUID(),
    });
  };
  run("saveProduct", {
    name: "Nước giặt TrueCare hương hoa",
    code: "TC-001",
    pack: 4,
    unit: "can",
    cost: "100000",
    price: "120000",
  });
  run("saveCustomer", {
    name: "Cửa hàng Minh Anh",
    address: "123 Đường Nguyễn Văn Linh, Thành phố Hồ Chí Minh",
    phone: "0901234567",
    visitDays: [1, 3, 5],
  });
  run("saveOrder", {
    customerId: state.customers[0].id,
    date: new Date().toISOString().slice(0, 10),
    lines: [{ productId: state.products[0].id, quantity: 12, price: "120000" }],
  });
  run("confirmOrder", { id: state.orders[0].id });
  run("recordDelivery", {
    orderId: state.orders[0].id,
    lines: [{ lineId: state.orders[0].lines[0].id, quantity: 4 }],
  });
  for (let i = 2; i <= 20; i++)
    run("saveCustomer", {
      name: `Đại lý ${String(i).padStart(2, "0")} — tên cửa hàng dài để kiểm tra hiển thị`,
      address: "456 Đường Võ Văn Kiệt, Phường Bến Thành, Thành phố Hồ Chí Minh",
      phone: "0901234567",
    });
  return state;
}

export async function mockWorkspace(
  page: Page,
  {
    state = sampleState(),
    role = "admin",
  }: { state?: AppState; role?: "admin" | "employee" } = {},
) {
  const user = {
    id: "qa",
    username: "minhanh",
    displayName: "Nguyễn Minh Anh",
    email: "qa@local.test",
    role,
    active: true,
  };
  const commands: any[] = [];
  const member = {
    ...user,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: state.summary,
    stateVersion: state.version,
    stateUpdatedAt: null,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p === "/api/auth/session") return route.fulfill({ json: { user } });
    if (p === "/api/state") return route.fulfill({ json: state });
    if (p === "/api/admin/workspaces/qa")
      return route.fulfill({ json: { state } });
    if (p === "/api/commands") {
      try {
        const command = req.postDataJSON();
        commands.push(command);
        state = execute(state, command);
        return route.fulfill({ json: state });
      } catch (error) {
        return route.fulfill({
          status: 400,
          json: {
            error: { code: "INVALID", message: (error as Error).message },
          },
        });
      }
    }
    if (p === "/api/auth/sessions")
      return route.fulfill({ json: { items: [] } });
    if (p === "/api/admin/team")
      return route.fulfill({ json: { members: [member] } });
    if (p === "/api/admin/dashboard")
      return route.fulfill({
        json: {
          summary: {
            employees: 1,
            orders: 1,
            partialOrders: 1,
            negativeFunds: 0,
            lowStock: 0,
            unresolved: 0,
            productsNeedingReview: 0,
          },
        },
      });
    if (p === "/api/admin/inventory")
      return route.fulfill({ json: { balances: [], movements: [] } });
    if (p === "/api/admin/catalogs")
      return route.fulfill({ json: { catalogs: state.catalogs, entries: [] } });
    if (p === "/api/admin/system/health")
      return route.fulfill({
        json: {
          api: "ok",
          database: "ok",
          latencyMs: 12,
          deployment: "qa-metronic",
          runtime: "Node.js",
        },
      });
    const items =
      p === "/api/admin/products"
        ? state.products.map((product) => ({
            ...product,
            usage: { orders: 1, programs: 0, inventory: 0 },
          }))
        : p === "/api/admin/customers"
          ? state.customers.map((customer) => ({
              ...customer,
              usage: { orders: 0, visits: 0, revenue: "0" },
            }))
          : [];
    if (p.startsWith("/api/admin/"))
      return route.fulfill({
        json: {
          items,
          total: items.length,
          page: 1,
          pages: 1,
          pageSize: 25,
          entries: [],
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: "TEST_ENDPOINT", message: p } },
    });
  });
  return { user, commands, getState: () => state };
}
