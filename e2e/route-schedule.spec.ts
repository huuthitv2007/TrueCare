import { test, expect } from "@playwright/test";
import { mockWorkspace } from "./metronic-fixture";

test("employee creates and completes a route schedule", async ({ page }) => {
  const fixture = await mockWorkspace(page);
  await page.goto("/route-schedule");
  await page.getByRole("button", { name: /Tạo lịch/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /Tạo lịch theo tuyến/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Ghi chú").fill("Ghé khách trọng điểm");
  await expect(dialog.getByText("Cửa hàng Minh Anh")).toBeVisible();
  await dialog.getByRole("button", { name: "Lưu lịch" }).click();
  await expect(page.getByText("Ghé khách trọng điểm")).toBeVisible();
  await page.getByRole("button", { name: /Đã thực hiện/ }).first().click();
  const complete = page.getByRole("dialog", { name: /Hoàn thành lịch theo tuyến/ });
  await complete.getByLabel("Ghi chú kết quả").fill("Đã chăm sóc xong");
  await complete.getByRole("button", { name: "Lưu kết quả" }).click();
  await expect(page.getByText("Đã chăm sóc xong")).toBeVisible();
  expect(fixture.getState().visits.some((visit) => visit.notes === "Đã chăm sóc xong")).toBe(true);
});


test("/admin base route redirects to the main dashboard while admin sections stay available", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#workspace-content h1")).toBeVisible();
  await expect(page.locator("#workspace-content h1")).not.toHaveText(/admin/i);
  await page.goto("/admin/overview");
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(page.locator("#workspace-content h1")).toBeVisible();
  await expect(page.locator("#workspace-content h1")).toContainText("TrueCare");
});
