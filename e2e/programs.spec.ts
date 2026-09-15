import { test, expect } from "@playwright/test";
import { mockWorkspace, sampleState } from "./metronic-fixture";

function smartState() {
  const state = sampleState();
  state.products[0] = {
    ...state.products[0], name: "Túi NGX 4.2KG Care", code: "NGX-4.2-TUI", variant: "Majestic đỏ",
    pack: 4, cost: "141000", price: "160000",
  };
  state.products.push({
    ...state.products[0], id: "smart-nxv", name: "Túi NXV 1.15 Lít", code: "NXV-1.15", variant: "Elizabeth tím",
    pack: 10, unit: "túi", cost: "70000", price: "77000",
  });
  state.ledger.push({ id: "fund", date: "2026-09-15", type: "opening", amount: "1000000", referenceId: "", notes: "Quỹ QA" });
  return state;
}

test("admin previews then saves a signed smart program without manual prices", async ({ page }) => {
  const fixture = await mockWorkspace(page, { state: smartState() });
  await page.goto("/programs");
  await page.getByRole("button", { name: "Tạo phương án", exact: true }).click();
  await expect(page.getByText("Phương án hợp lệ", { exact: true })).toBeVisible();
  await expect(page.getByText(/151\.000/).first()).toBeVisible();
  await expect(page.getByText(/NHTT:/).first()).toBeVisible();
  await expect(page.getByText(/Hàng bù:/).first()).toBeVisible();
  await page.getByRole("button", { name: "Chọn & lưu chương trình", exact: true }).first().click();
  await expect(page.getByText(/Chương trình thông minh/)).toBeVisible();
  expect(fixture.commands.some((command) => command.type === "reserveSmartProgram")).toBe(true);
  expect(fixture.commands.find((command) => command.type === "reserveSmartProgram")?.payload.lines).toBeUndefined();
  await page.getByRole("button", { name: "Xóa chương trình", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Xóa chương trình đã lưu", exact: true });
  await expect(dialog.getByText(/giải phóng/)).toBeVisible();
  await dialog.getByRole("button", { name: "Lưu trữ chương trình", exact: true }).click();
  expect(fixture.commands.some((command) => command.type === "archiveProgram")).toBe(true);
});

test("only an admin sees smart program creation and archive action", async ({ page }) => {
  await mockWorkspace(page, { state: smartState(), role: "employee" });
  await page.goto("/programs");
  await expect(page.getByText(/Chỉ quản trị viên được tạo hoặc lưu/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo phương án", exact: true })).toHaveCount(0);
});
