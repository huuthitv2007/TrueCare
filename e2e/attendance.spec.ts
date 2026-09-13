import { expect, test } from "@playwright/test";
import { mockWorkspace, sampleState } from "./metronic-fixture";
import { businessDate } from "../shared/business-date";

test("employee corrects today's attendance and requests a past day without adding an unapproved workday", async ({ page }) => {
  const fixture = await mockWorkspace(page, { state: sampleState(), role: "employee" });
  await page.goto("/report");
  await page.getByRole("button", { name: "Điều chỉnh điểm danh hôm nay" }).click();
  const record = page.getByRole("dialog", { name: "Điểm danh hôm nay", exact: true });
  await record.getByLabel("Trạng thái muốn ghi nhận").selectOption("leave");
  await record.getByLabel("Lý do", { exact: true }).fill("Nghỉ phép theo lịch đã xác nhận");
  await record.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await expect(record).toHaveCount(0);
  expect(fixture.getState().attendance?.find(item => item.date === businessDate())?.status).toBe("leave");
  const yesterday = new Date(businessDate() + "T12:00:00Z"); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const past = yesterday.toISOString().slice(0, 10);
  await page.getByLabel("Ngày", { exact: true }).fill(past);
  await page.getByRole("button", { name: "Yêu cầu bổ sung/điều chỉnh", exact: true }).click();
  const request = page.getByRole("dialog", { name: "Yêu cầu bổ sung/điều chỉnh", exact: true });
  await request.getByLabel("Lý do", { exact: true }).fill("Quên điểm danh ngày làm việc hôm qua");
  await request.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(request).toHaveCount(0);
  await expect(page.getByText("Yêu cầu đang chờ duyệt", { exact: true })).toBeVisible();
  expect(fixture.getState().attendance?.some(item => item.date === past)).toBe(false);
  expect(fixture.getState().attendanceRequests?.find(item => item.date === past)?.status).toBe("pending");
  await expect(page.getByRole("button", { name: "Duyệt bổ sung toàn đội" })).toHaveCount(0);
});
