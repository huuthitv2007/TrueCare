import { expect, test, type APIRequestContext } from "@playwright/test";
import { seedOwnWorkspace } from "./test-seed";
import { businessDate } from "../shared/business-date";

test("real API enforces employee A/B isolation and admin care access", async ({ playwright, baseURL }, info) => {
  const contexts: APIRequestContext[] = [];
  const create = async (label: string) => {
    const api = await playwright.request.newContext({ baseURL }); contexts.push(api);
    const username = `care_${label}_${info.project.name}_${Date.now()}`;
    const register = await api.post("/api/auth/register", { data: { companyCode: "TRUECARE", username, email: `${username}@local.test`, displayName: label, password: "LocalCareTest123!" } });
    expect(register.ok(), await register.text()).toBeTruthy();
    const { user } = await (await api.get("/api/auth/session")).json();
    expect(user.role).toBe("employee");
    return { api, user };
  };
  try {
    const a = await create("a"), b = await create("b"), admin = await create("admin");
    await seedOwnWorkspace(admin.api, [], "admin");
    expect((await (await admin.api.get("/api/auth/session")).json()).user.role).toBe("admin");
    for (const employee of [a, b]) {
      for (const path of ["/api/admin/attendance-requests", "/api/admin/route-schedules", `/api/admin/workspaces/${employee === a ? b.user.id : a.user.id}`]) {
        const response = await employee.api.get(path);
        expect(response.status(), path).toBe(403);
      }
      const state = await (await employee.api.get("/api/state")).json();
      const denied = await employee.api.post("/api/commands", { data: { type: "saveProduct", payload: { name: "Forbidden product", price: "1000", cost: "500", pack: 1 }, version: state.version, idempotencyKey: crypto.randomUUID() } });
      expect(denied.status()).toBe(403);
      const deniedReview = await employee.api.post(`/api/admin/workspaces/${b.user.id}/commands`, { data: { type: "reviewAttendanceRequest", payload: { id: "not-owned", decision: "approved", reason: "Forbidden review" }, version: 0, idempotencyKey: crypto.randomUUID() } });
      expect(deniedReview.status()).toBe(403);
    }
    for (const path of ["/api/admin/attendance-requests", "/api/admin/route-schedules", `/api/admin/workspaces/${a.user.id}`]) {
      const response = await admin.api.get(path);
      expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
    }
    const before = await (await a.api.get("/api/state")).json();
    const command = { type: "setAttendance", payload: { date: businessDate(), status: "worked", reason: "Local permission verification" }, version: before.version, idempotencyKey: crypto.randomUUID() };
    expect((await a.api.post("/api/commands", { data: command })).ok()).toBeTruthy();
    expect((await (await a.api.get("/api/state")).json()).attendance).toHaveLength(1);
    expect((await (await b.api.get("/api/state")).json()).attendance).toHaveLength(0);
  } finally { await Promise.all(contexts.map(context => context.dispose())); }
});
