import { test, expect } from "@playwright/test";
import { mockWorkspace, sampleState } from "./metronic-fixture";
import { execute } from "../server/domain";

test("program form lists eligible products and explains blocked products", async ({ page }) => {
  const state = sampleState();
  state.products.push({
    id: "blocked-product",
    name: "Blocked product",
    code: "BLOCK",
    group: "QA",
    brand: "TrueCare",
    variant: "",
    unit: "can",
    pack: 1,
    cost: null,
    price: "120000",
    effectiveDate: "2026-09-13",
  });
  await mockWorkspace(page, { state });
  await page.goto("/programs");
  const productSelect = page.getByLabel(/Th.m s.n ph.m/i);
  await expect(productSelect).toBeVisible();
  await expect(productSelect.locator("option:not([disabled])").filter({ hasText: /TC-001/ })).toHaveCount(1);
  await expect(productSelect.locator("option[disabled]").filter({ hasText: /BLOCK/ })).toHaveCount(1);
  await productSelect.selectOption({ index: 1 });
  await expect(page.getByTestId("program-selected-product")).toContainText(/TrueCare/);
  await expect(page.getByText(/1 sản phẩm đang bị ẩn khỏi danh sách chọn/i)).toBeVisible();
});

test("employee uses a program allocation to create one confirmed order", async ({ page }) => {
  let state = sampleState();
  state = execute(state, { type: "reserveProgram", payload: { name: "Chương trình QA", count: 2, expiresAt: "2099-01-01", lines: [{ productId: state.products[0].id, quantity: 1, price: "120000" }] }, version: state.version, idempotencyKey: crypto.randomUUID() }, { id: "qa", role: "employee" });
  const count = state.orders.length;
  const fixture = await mockWorkspace(page, { state, role: "employee" });
  await page.goto("/programs");
  await page.getByRole("button", { name: "Dùng suất", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dùng suất tạo toa", exact: true });
  await dialog.getByLabel("Khách hàng nhận suất").selectOption(state.customers[0].id);
  await dialog.getByLabel("Số suất sử dụng").fill("1");
  await dialog.getByRole("button", { name: "Xác nhận tạo toa", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.getState().orders).toHaveLength(count + 1);
  expect(fixture.getState().orders.at(-1)?.status).toBe("confirmed");
  expect(fixture.getState().programs[0].remaining).toBe(1);
  expect(fixture.commands.filter(command => command.type === "applyProgram")).toHaveLength(1);
});
