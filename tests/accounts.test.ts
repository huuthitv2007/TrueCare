import test from "node:test";
import assert from "node:assert/strict";
import {
  accountUser,
  isAdmin,
  normalizeEmail,
  normalizeUsername,
  requireAdmin,
  sessionIsCurrent,
  validateEmployeePassword,
} from "../server/accounts.js";
import { DomainError } from "../server/domain.js";

const row = {
  user_id: "user-1",
  email: "demo@huuthi.com",
  username: "demo",
  display_name: "Nhân viên Demo",
  role: "employee" as const,
  active: true,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};
test("chuẩn hóa username/email và role được lấy từ nguồn server", () => {
  assert.equal(normalizeUsername(" Demo_01 "), "demo_01");
  assert.equal(normalizeEmail(" ADMIN@HUUTHI.COM "), "admin@huuthi.com");
  assert.deepEqual(accountUser(row), {
    id: "user-1",
    email: "demo@huuthi.com",
    username: "demo",
    displayName: "Nhân viên Demo",
    role: "employee",
    active: true,
  });
  assert.equal(isAdmin(accountUser({ ...row, role: "admin" })), true);
  assert.equal(isAdmin(accountUser(row)), false);
});
test("chặn username, mật khẩu nhân viên yếu và role employee vào API admin", () => {
  assert.throws(() => normalizeUsername("a!"), DomainError);
  assert.throws(() => validateEmployeePassword("short"), DomainError);
  assert.throws(() => requireAdmin(accountUser(row)), DomainError);
});
test("thu hồi phiên chặn token cũ nhưng cho phép token phát hành sau mốc", () => {
  const account = { ...row, session_valid_after: "2026-09-11T10:00:00.000Z" };
  assert.equal(
    sessionIsCurrent(account, Date.parse("2026-09-11T09:59:59Z") / 1000),
    false,
  );
  assert.equal(
    sessionIsCurrent(account, Date.parse("2026-09-11T10:00:00Z") / 1000),
    true,
  );
});
