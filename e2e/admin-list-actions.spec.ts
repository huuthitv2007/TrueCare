import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAdminLists } from "./admin-list-fixture";

test("admin action dialogs save without a free-form management reason", async ({ page }) => {
  await mockAdminLists(page);
  await page.goto("/admin/inventory");
  const action = page.locator("tbody button:not([disabled])").filter({ hasText: "Xóa" }).first();
  await expect(action).toBeVisible();
  await action.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("textarea")).toHaveCount(0);
  await dialog.locator(".modal-actions button").last().click();
  await expect(dialog).toHaveCount(0);
});

test("admin action dialog keeps keyboard dismissal and page accessibility", async ({ page }) => {
  await mockAdminLists(page);
  await page.goto("/admin/customers");
  const scroller = page.getByRole("region", { name: "Bảng dữ liệu có thể cuộn" });
  const action = page.locator("tbody button").filter({ hasText: "Xóa" }).first();
  await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(action).toBeInViewport();
  await action.click();
  await expect(page.getByRole("dialog").locator("textarea")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(action).toBeFocused();
  const results = await new AxeBuilder({ page }).include("#workspace-content").analyze();
  expect(results.violations).toEqual([]);
});
