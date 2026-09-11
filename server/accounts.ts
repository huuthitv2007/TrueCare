import type { User, UserRole } from "../shared/types.js";
import { DomainError, assert } from "./domain.js";

export interface AccountRow {
  user_id: string;
  email: string;
  username: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  session_valid_after?: string;
  last_login_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  active_before_delete?: boolean | null;
}
export function normalizeUsername(value: unknown) {
  const username = String(value ?? "")
    .trim()
    .toLowerCase();
  assert(
    /^[a-z0-9_.-]{3,40}$/.test(username),
    "Tên đăng nhập từ 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang",
  );
  return username;
}
export function normalizeEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Email không hợp lệ");
  return email;
}
export function validateEmployeePassword(value: unknown) {
  const password = String(value ?? "");
  assert(
    password.length >= 10 && password.length <= 200,
    "Mật khẩu nhân viên từ 10 đến 200 ký tự",
  );
  return password;
}
export function accountUser(row: AccountRow): User {
  return {
    id: row.user_id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
  };
}
export function isAdmin(user: User) {
  return user.role === "admin" && user.active;
}
export function requireAdmin(user: User) {
  if (!isAdmin(user))
    throw new DomainError(
      "FORBIDDEN",
      "Chỉ quản trị viên được thực hiện thao tác này",
      403,
    );
}
export function sessionIsCurrent(row: AccountRow, issuedAtSeconds: number) {
  const boundary = Date.parse(
    row.session_valid_after ?? "1970-01-01T00:00:00Z",
  );
  return (
    Number.isFinite(issuedAtSeconds) &&
    issuedAtSeconds > 0 &&
    Number.isFinite(boundary) &&
    issuedAtSeconds * 1000 >= boundary
  );
}
