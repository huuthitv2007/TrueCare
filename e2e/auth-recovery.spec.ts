import { expect, test } from "@playwright/test";

test("recovery exchanges code, clears URL, validates confirmation and returns to login", async ({ page }) => {
  const exchanges: unknown[] = [], resets: unknown[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: null } });
    if (path === "/api/auth/recovery/exchange") { exchanges.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    if (path === "/api/auth/recovery/reset") { resets.push(route.request().postDataJSON()); return route.fulfill({ json: { message: "Đã đổi mật khẩu" } }); }
    return route.fulfill({ status: 404, json: { error: "Unexpected endpoint" } });
  });
  await page.goto("/reset-password?code=email-code&sb_flow_id=flow-id");
  await expect(page.getByLabel("Mật khẩu mới", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(exchanges).toEqual([{ code: "email-code", flowId: "flow-id" }]);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("TestNewPassword123!");
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("MismatchPassword123!");
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(page.getByText("Mật khẩu xác nhận không khớp")).toBeVisible();
  expect(resets).toHaveLength(0);
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("TestNewPassword123!");
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?passwordReset=1$/);
  await expect(page.getByText(/Đã đổi mật khẩu và đăng xuất/)).toBeVisible();
  expect(resets).toHaveLength(1);
});

test("expired recovery link shows recovery guidance and no password form", async ({ page }) => {
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname === "/api/auth/session") return route.fulfill({ json: { user: null } });
    return route.fulfill({ status: 401, json: { error: { code: "RECOVERY_INVALID", message: "Liên kết đã dùng hoặc hết hạn" } } });
  });
  await page.goto("/reset-password?code=expired-code");
  await expect(page.getByText("Liên kết đã dùng hoặc hết hạn")).toBeVisible();
  await expect(page.getByLabel("Mật khẩu mới", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Yêu cầu liên kết mới" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("button", { name: /Gửi hướng dẫn/ })).toBeVisible();
});

test("site URL recovery callback opens the reset screen", async ({ page }) => {
  const exchanges: unknown[] = [];
  await page.route("**/api/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") return route.fulfill({ json: { user: null } });
    if (pathname === "/api/auth/recovery/exchange") {
      exchanges.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected endpoint" } });
  });
  await page.goto("/?code=site-url-code&sb_flow_id=site-flow");
  await expect(page.getByLabel("Mật khẩu mới", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(exchanges).toEqual([{ code: "site-url-code", flowId: "site-flow" }]);
});
