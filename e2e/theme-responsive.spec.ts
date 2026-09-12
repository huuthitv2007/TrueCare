import { expect, test } from "@playwright/test";

test("theme persists and the workspace remains responsive", async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`.replace(/\W/g, "_");
  const username = `theme_${suffix}`;
  const password = "TrueCareTest123!";
  const registration = await request.post("/api/auth/register", {
    data: {
      companyCode: "TRUECARE",
      email: `${username}@local.test`,
      username,
      displayName: "Kiểm thử giao diện",
      password,
    },
  });
  expect(registration.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByLabel("Email hoặc tên đăng nhập").fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  const targetTheme =
    (await page.locator("html").getAttribute("data-theme")) === "dark"
      ? "light"
      : "dark";
  await page
    .getByRole("button", {
      name: new RegExp(`giao diện ${targetTheme === "dark" ? "tối" : "sáng"}`),
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", targetTheme);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", targetTheme);

  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { name: "Tạo đơn hàng" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    await page.getByRole("button", { name: "Mở menu" }).click();
    await expect(page.getByRole('dialog', { name: 'Menu TrueCare' })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole('dialog', { name: 'Menu TrueCare' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mở menu' })).toBeFocused();
  } else {
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page
    .locator("#workspace-content > *")
    .first()
    .evaluate((node) => getComputedStyle(node).animationDuration);
  expect(["0s", "1e-05s", "0.00001s"]).toContain(duration);
});
