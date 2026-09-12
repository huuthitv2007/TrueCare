import { test, expect } from "@playwright/test";
import type { AppState } from "../shared/types";

test("real API: edit and confirm order, deliver, return, export and print", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const username = `business_${testInfo.project.name}_${Date.now()}`;
  const created = await context.request.post("/api/auth/register", {
    data: {
      companyCode: "TRUECARE",
      username,
      email: username + "@local.test",
      displayName: "Nhân viên kiểm thử",
      password: "TrueCareTest123!",
    },
  });
  expect(created.ok()).toBeTruthy();
  const getState = async () =>
    (await (await context.request.get("/api/state")).json()) as AppState;
  const run = async (type: string, payload: unknown) => {
    const state = await getState();
    const response = await context.request.post("/api/commands", {
      data: {
        type,
        payload,
        version: state.version,
        sharedVersion: state.sharedVersion,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()) as AppState;
  };
  let state = await run("saveProduct", {
    name: "Nước giặt xả 3.6kg QA",
    group: "NƯỚC GIẶT XẢ TRUECARE",
    unit: "can",
    pack: 4,
    cost: "100000",
    price: "150000",
  });
  const product = state.products.find(
    (p) => p.name === "Nước giặt xả 3.6kg QA",
  )!;
  state = await run("saveCustomer", { name: "Cửa hàng kiểm thử " + username });
  const customer = state.customers.find(
    (c) => c.name === "Cửa hàng kiểm thử " + username,
  )!;
  state = await run("saveOrder", {
    customerId: customer.id,
    lines: [{ productId: product.id, quantity: 4, price: "150000" }],
  });
  const order = state.orders.at(-1)!;
  await page.goto(`/orders/${order.id}`);
  await page
    .getByLabel("Ghi chú toa")
    .fill("Giao vào buổi sáng — kiểm tra giao diện mới");
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await getState()).orders.find((o) => o.id === order.id)?.notes,
    )
    .toContain("buổi sáng");
  await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await getState()).orders.find((o) => o.id === order.id)?.status,
    )
    .toBe("confirmed");
  await page
    .getByRole("button", { name: /Ghi nhận.*giao|Giao hàng/ })
    .last()
    .click();
  const delivery = page.getByRole("dialog", {
    name: "Ghi nhận hàng thực giao",
  });
  await delivery.getByRole("spinbutton", { name: /Số lượng/ }).fill("2");
  await delivery.getByRole("button", { name: "Xác nhận thực giao" }).click();
  await expect(delivery).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await getState()).orders.find((o) => o.id === order.id)?.status,
    )
    .toBe("partial");
  await page.getByRole("tab", { name: "Chi tiết" }).click();
  await page
    .getByRole("button", { name: "Nhận hàng trả", exact: true })
    .click();
  const returned = page.getByRole("dialog", { name: "Nhận hàng khách trả" });
  await returned.getByRole("spinbutton", { name: /Số lượng/ }).fill("1");
  await returned
    .getByLabel("Lý do trả hàng")
    .fill("Khách trả một can trong kiểm thử");
  await returned.getByRole("button", { name: /Xác nhận.*trả/ }).click();
  await expect(returned).toHaveCount(0);
  await expect.poll(async () => (await getState()).returns.length).toBe(1);
  // Capture the real print document without opening the operating system print dialog.
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "In toa" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(popup.getByRole("img", { name: "TrueCare" })).toBeVisible();
  await expect
    .poll(() =>
      popup
        .getByRole("img", { name: "TrueCare" })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(popup.locator("header")).toHaveCSS("display", "flex");
  await expect(popup.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await expect(
    popup.getByText("Nước giặt xả 3.6kg QA", { exact: true }),
  ).toBeVisible();
  await popup.close();
  await page.goto("/sales");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(
    (await getState()).orders.find((o) => o.id === order.id)?.lines[0].returned,
  ).toBe(1);
});

test("real API: upload TXT, preview, acknowledge and commit import", async ({
  page,
  context,
}, testInfo) => {
  const username = `import_${testInfo.project.name}_${Date.now()}`;
  const response = await context.request.post("/api/auth/register", {
    data: {
      companyCode: "TRUECARE",
      username,
      email: username + "@local.test",
      displayName: "Nhập dữ liệu QA",
      password: "TrueCareTest123!",
    },
  });
  expect(response.ok()).toBeTruthy();
  const before = await (await context.request.get("/api/state")).json();
  const seeded = await context.request.post("/api/commands", {
    data: {
      type: "saveProduct",
      payload: {
        name: "Nước giặt xả 3.6kg",
        group: "NƯỚC GIẶT XẢ TRUECARE",
        unit: "can",
        pack: 4,
        cost: "100000",
        price: "150000",
      },
      version: before.version,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(seeded.ok(), await seeded.text()).toBeTruthy();
  await page.goto("/imports");
  await page.getByLabel("Tệp cần nhập").setInputFiles({
    name: "qa-orders.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      `08/09/2026\nĐ1/ Cửa hàng ${username}\nĐịa chỉ mẫu\n1T NGX can 3.6KG giá 139k * 4 = 556k\nTC: 556k`,
    ),
  });
  await page.getByRole("button", { name: "Đọc và đối chiếu tệp" }).click();
  await expect(
    page.getByRole("button", { name: "Đóng bản xem trước" }),
  ).toBeVisible();
  const acknowledge = page.getByRole("checkbox", {
    name: "Tôi đã xem các lưu ý và đồng ý lưu dữ liệu đã đối chiếu.",
  });
  await acknowledge.check();
  await page.getByRole("button", { name: "Lưu dữ liệu đã đối chiếu" }).click();
  await expect(
    page.getByRole("button", { name: "Đã nhập dữ liệu", exact: true }),
  ).toBeDisabled();
  const state = await (await context.request.get("/api/state")).json();
  expect(state.imports.length).toBe(1);
  expect(state.orders.at(-1).status).toBe("draft");
  expect(state.summary.available).toBe("0");
});
