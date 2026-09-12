import { test, expect } from "@playwright/test";
import { mockAdminLists } from "./admin-list-fixture";

const employeeRoutes = [
  "/",
  "/orders",
  "/orders/new",
  "/customers",
  "/products",
  "/sales",
  "/delivered",
  "/inventory",
  "/fund",
  "/programs",
  "/report",
  "/imports",
  "/settings",
];
const adminRoutes = [
  "overview",
  "customers",
  "orders",
  "products",
  "inventory",
  "funds",
  "employees",
  "catalogs",
  "imports",
  "audit",
  "system",
].map((route) => `/admin/${route}`);

for (const width of [360, 390, 768, 1023, 1024, 1440, 1920])
  for (const theme of ["light", "dark"]) {
    test.describe(`${width}px ${theme}`, () => {
      // Set the viewport before opening the page. Resizing a newly created
      // headed Firefox window can stall on Windows before navigation begins.
      test.use({ viewport: { width, height: 900 } });
      test(`all routes at ${width}px in ${theme}`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(120_000);
        await page.addInitScript((value) => {
          localStorage.setItem("truecare-theme:qa", value);
          localStorage.setItem("truecare-theme", value);
        }, theme);
        const fixture = await mockAdminLists(page);
        const errors: string[] = [];
        page.on("pageerror", (error) => {
          errors.push(error.message);
          console.log(page.url(), error.message);
        });
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text());
            console.log(page.url(), message.text().slice(0, 200));
          }
        });
        page.on("response", (response) => {
          if (response.status() >= 400)
            errors.push(`${response.status()} ${response.url()}`);
        });
        for (const route of [
          ...employeeRoutes,
          `/orders/${fixture.getState().orders[0].id}`,
          ...adminRoutes,
        ]) {
          await page.goto(route);
          await expect(page.locator("#workspace-content h1")).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await expect(page.locator("html")).toHaveClass(
            theme === "dark" ? /dark/ : /^$/,
          );
          await expect(
            page.getByRole("heading", { name: "Không thể hiển thị màn hình" }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("status").filter({ hasText: "Đang tải" }),
          ).toHaveCount(0);
          const overflowing = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          expect(
            overflowing.scroll - overflowing.width,
            route,
          ).toBeLessThanOrEqual(1);
          expect(errors, route).toEqual([]);
          if (
            testInfo.project.name === "desktop" &&
            [390, 1440].includes(width) &&
            ["/admin/customers", "/admin/inventory", "/admin/funds", "/admin/imports", "/admin/audit"].includes(
              route,
            )
          ) {
            await page.screenshot({
              path: `docs/design/admin-delete/${route === "/" ? "dashboard" : route.slice(1).replaceAll("/", "-")}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        }
      });
    });
  }
