import { test, expect } from "@playwright/test";
import { mockWorkspace, sampleState } from "./metronic-fixture";

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
  await expect(page.getByText(/1 s.n ph.m .ang b. .n kh.i danh s.ch ch.n/i)).toBeVisible();
});
