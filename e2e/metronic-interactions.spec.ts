import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockWorkspace } from "./metronic-fixture";

test("drawer focus, navigation, breakpoint transition and desktop collapse", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Mở menu" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Menu TrueCare" });
  await expect(drawer).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Shift+Tab");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await drawer.getByRole("link", { name: "Khách hàng", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(370, 400);
  await expect(drawer).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(trigger).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Thanh điều hướng" }),
  ).toHaveCSS("width", "280px");
  await page.getByRole("button", { name: "Thu gọn thanh điều hướng" }).click();
  await expect(
    page.getByRole("complementary", { name: "Thanh điều hướng" }),
  ).toHaveCSS("width", "80px");
  await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();
  await page.setViewportSize({ width: 1023, height: 900 });
  await trigger.click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("customer modal, filters and pagination retain working controls", async ({
  page,
}) => {
  const fixture = await mockWorkspace(page);
  await page.goto("/customers");
  await page.getByRole("button", { name: "Sau", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Trước", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Tìm tên khách, điện thoại, địa chỉ…" })
    .fill("Minh Anh");
  await expect(
    page.getByRole("button", { name: "Sau", exact: true }),
  ).toBeDisabled();
  const trigger = page.getByRole("button", { name: "Tạo khách hàng" });
  await trigger.click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.commands).toEqual([]);
  await page.goto("/orders/new");
  await page.getByRole("tab", { name: "DS khách hàng" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Hóa đơn" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Hóa đơn" })).toBeVisible();
});

test("WCAG AA on login, dashboard, populated tables, order form and modal in both themes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", {
          name: `Chuyển sang giao diện ${theme === "dark" ? "tối" : "sáng"}`,
        })
        .click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await mockWorkspace(page);
  for (const theme of ["light", "dark"]) {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Tổng quan", exact: true }),
    ).toBeVisible();
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", {
          name: `Chuyển sang giao diện ${theme === "dark" ? "tối" : "sáng"}`,
        })
        .click();
    for (const route of ["/", "/customers", "/orders/new", "/admin/catalogs"]) {
      await page.goto(route);
      await expect(page.locator("#workspace-content h1")).toBeVisible();
      if (route === "/orders/new")
        await page.getByRole("tab", { name: "Hóa đơn" }).click();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
        `${route} ${theme}`,
      ).toEqual([]);
    }
    await page.goto("/customers");
    await page.getByRole("button", { name: "Tạo khách hàng" }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      `modal ${theme}`,
    ).toEqual([]);
  }
});

test("forgot password, invalid login, loading and retry states", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: { code: "AUTH", message: "Thông tin đăng nhập không hợp lệ" },
      },
    }),
  );
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({ json: { message: "Đã tiếp nhận yêu cầu khôi phục." } }),
  );
  await page.goto("/");
  await page.getByLabel("Email hoặc tên đăng nhập").fill("qa");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Thông tin đăng nhập");
  await page.getByRole("button", { name: "Quên mật khẩu?" }).click();
  await page.getByLabel("Email hoặc tên đăng nhập").fill("qa");
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  await expect(page.getByText("Đã tiếp nhận yêu cầu khôi phục.")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  const fixture = await mockWorkspace(page, { role: "employee" });
  let failed = true;
  await page.route("**/api/state", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: { message: "Tạm thời không thể tải dữ liệu" } },
        })
      : route.fulfill({ json: fixture.getState() }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Tạm thời");
  failed = false;
  await page.getByRole("button", { name: "Thử tải lại" }).click();
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
});

test("theme changes in an inspected workspace never write another account preference", async ({
  page,
}) => {
  const fixture = await mockWorkspace(page);
  await page.goto("/admin/employees");
  await page.getByRole("button", { name: "Khác", exact: true }).click();
  await page.getByRole("button", { name: "Mở dữ liệu", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Không gian đang quản trị" }),
  ).toBeVisible();
  const before = fixture.getState().settings.theme;
  const next = before === "light" ? "tối" : "sáng";
  await page
    .getByRole("button", { name: `Chuyển sang giao diện ${next}` })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    before === "light" ? "dark" : "light",
  );
  expect(fixture.commands).toEqual([]);
  expect(fixture.getState().settings.theme).toBe(before);
});

test("unavailable browser storage does not prevent login shell or theme changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Disabled", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Disabled", "SecurityError");
    };
  });
  await mockWorkspace(page, { role: "employee" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chuyển sang giao diện tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
