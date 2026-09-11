import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { previewPrograms, DomainError, assert } from "./domain.js";
import { createSupabaseAdapter } from "./supabase-adapter.js";
import {
  accountUser,
  normalizeEmail,
  normalizeUsername,
  requireAdmin,
  sessionIsCurrent,
  validateEmployeePassword,
  type AccountRow,
} from "./accounts.js";
import type {
  AppState,
  Command,
  EmployeeAccount,
  TeamMember,
  User,
  UserRole,
} from "../shared/types.js";
import { reportRows, reportTotals } from "../src/lib/reporting.js";
import { applyImport, authorizeImport } from "./import-service.js";
import {
  catalogUsage,
  customerUsage,
  dashboardOf,
  duplicateCustomers,
  pageOf,
  productUsage,
  type OwnedState,
} from "./admin-domain.js";

const url = process.env.SUPABASE_URL,
  serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey)
  throw new Error(
    "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required in production.",
  );
const app = express();
app.set("trust proxy", 1);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const adminRequests = new Map<string, { count: number; resetAt: number }>();
const assertLoginRate = (key: string) => {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + 15 * 60_000 });
    return;
  }
  if (current.count >= 8)
    throw new DomainError(
      "RATE_LIMIT",
      "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.",
      429,
    );
};
const failedLogin = (key: string) => {
  const current = loginAttempts.get(key) ?? {
    count: 0,
    resetAt: Date.now() + 15 * 60_000,
  };
  current.count += 1;
  loginAttempts.set(key, current);
};
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createSupabaseAdapter(url, serviceKey);
const previews = new Map<
  string,
  { owner: string; data: any; expires: number; jobId?: string }
>();
type Session = { token: string; user: User; account: AccountRow };
const accountFields =
  "user_id,email,username,display_name,role,active,created_at,updated_at,session_valid_after,last_login_at,deleted_at,deleted_by,active_before_delete";
app.disable("x-powered-by");
app.use(express.json({ limit: "14mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (
    req.method !== "GET" &&
    process.env.APP_ORIGIN &&
    req.headers.origin &&
    req.headers.origin !== process.env.APP_ORIGIN
  ) {
    res.status(403).json({
      error: { code: "ORIGIN", message: "Nguồn yêu cầu không hợp lệ" },
    });
    return;
  }
  next();
});
const cookie = (req: express.Request) =>
  req.headers.cookie?.match(/(?:^|;\s*)tc_session=([^;]+)/)?.[1] || "";
const tokenOf = (req: express.Request) => decodeURIComponent(cookie(req));
const setSession = (res: express.Response, token: string) =>
  res.cookie("tc_session", encodeURIComponent(token), {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  });
const route =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
const asAccount = (row: any): AccountRow => ({
  user_id: row.user_id,
  email: row.email,
  username: row.username,
  display_name: row.display_name,
  role: row.role as UserRole,
  active: !!row.active,
  created_at: row.created_at,
  updated_at: row.updated_at,
  session_valid_after: row.session_valid_after,
  last_login_at: row.last_login_at,
  deleted_at: row.deleted_at,
  deleted_by: row.deleted_by,
  active_before_delete: row.active_before_delete,
});
const accountOf = async (userId: string) => {
  const { data, error } = await admin
    .from("employee_accounts")
    .select(accountFields)
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new DomainError("STORAGE", "Không đọc được quyền tài khoản", 503);
  if (!data)
    throw new DomainError(
      "AUTH",
      "Tài khoản chưa được quản trị viên cấp quyền",
      403,
    );
  return asAccount(data);
};
const userOf = async (req: express.Request): Promise<Session> => {
  const token = tokenOf(req);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    throw new DomainError("AUTH", "Vui lòng đăng nhập", 401);
  const account = await accountOf(data.user.id);
  if (!account.active)
    throw new DomainError("AUTH", "Tài khoản đã bị khóa", 403);
  let issuedAt = 0;
  try {
    issuedAt = Number(
      JSON.parse(
        Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
      ).iat,
    );
  } catch {}
  if (!sessionIsCurrent(account, issuedAt))
    throw new DomainError("AUTH", "Phiên đăng nhập đã được thu hồi", 401);
  return { token, user: accountUser(account), account };
};
const revokeSessions = async (userId: string) => {
  // Subtract one second so a login issued in the same clock second remains valid.
  const sessionValidAfter = new Date(Date.now() - 1000).toISOString();
  const { error } = await admin
    .from("employee_accounts")
    .update({
      session_valid_after: sessionValidAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error)
    throw new DomainError("STORAGE", "Không thể thu hồi phiên đăng nhập", 503);
  return sessionValidAfter;
};
const logAdmin = async (
  actor: string,
  target: string | null,
  action: string,
  reason: string,
  details: Record<string, unknown> = {},
  meta: {
    requestId?: string;
    objectType?: string;
    objectId?: string;
    before?: unknown;
    after?: unknown;
  } = {},
) => {
  const { error } = await admin.from("admin_audit_logs").insert({
    id: randomUUID(),
    actor_id: actor,
    target_user_id: target,
    action,
    reason,
    details,
    request_id: meta.requestId,
    object_type: meta.objectType,
    object_id: meta.objectId,
    before_data: meta.before,
    after_data: meta.after,
  });
  if (error)
    throw new DomainError("STORAGE", "Không thể ghi nhật ký quản trị", 503);
};
const reasonOf = (value: unknown) => {
  const reason = String(value ?? "").trim();
  assert(
    reason.length >= 3 && reason.length <= 1000,
    "Cần lý do thao tác từ 3 đến 1.000 ký tự",
  );
  return reason;
};
const employeeAccount = (row: AccountRow): EmployeeAccount => ({
  id: row.user_id,
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastLoginAt: row.last_login_at ?? null,
  deletedAt: row.deleted_at ?? null,
  deletedBy: row.deleted_by ?? null,
  activeBeforeDelete: row.active_before_delete ?? null,
});
async function resolveLogin(value: unknown) {
  const login = String(value ?? "")
    .trim()
    .toLowerCase();
  assert(login, "Thông tin đăng nhập không hợp lệ", "AUTH");
  const query = login.includes("@")
    ? admin
        .from("employee_accounts")
        .select(accountFields)
        .eq("email", login)
        .maybeSingle()
    : admin
        .from("employee_accounts")
        .select(accountFields)
        .eq("username_normalized", normalizeUsername(login))
        .maybeSingle();
  const { data, error } = await query;
  if (error || !data)
    throw new DomainError("AUTH", "Thông tin đăng nhập không hợp lệ", 401);
  const account = asAccount(data);
  if (!account.active)
    throw new DomainError("AUTH", "Tài khoản đã bị khóa", 403);
  return account;
}
async function createEmployee(input: any) {
  const email = normalizeEmail(input.email),
    username = normalizeUsername(input.username),
    displayName = String(input.displayName ?? username).trim();
  assert(displayName && displayName.length <= 120, "Tên hiển thị không hợp lệ");
  const password = validateEmployeePassword(input.password);
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, displayName },
    app_metadata: { truecare_role: "employee" },
  });
  if (created.error || !created.data.user)
    throw new DomainError(
      "AUTH",
      created.error?.message || "Không tạo được tài khoản",
      400,
    );
  const { error } = await admin.from("employee_accounts").insert({
    user_id: created.data.user.id,
    email,
    username,
    display_name: displayName,
    role: "employee",
    active: true,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw new DomainError(
      "AUTH",
      error.code === "23505"
        ? "Email hoặc tên đăng nhập đã tồn tại"
        : "Không lưu được tài khoản",
      400,
    );
  }
  return accountOf(created.data.user.id);
}
function summaryFor(state: AppState, from?: string, to?: string) {
  if (!from || !to) return state.summary;
  const ordered = reportTotals(reportRows(state, "ordered", { from, to })),
    delivered = reportTotals(reportRows(state, "delivered", { from, to }));
  return {
    ...state.summary,
    ordered: ordered.revenue,
    delivered: delivered.employeeSales ?? "0",
    customerDelivered: delivered.revenue,
    fund: delivered.margin ?? "0",
    available: delivered.margin ?? "0",
    unresolved: ordered.margin === null || delivered.margin === null ? 1 : 0,
  };
}
async function team(from?: string, to?: string) {
  const { data, error } = await admin
    .from("employee_accounts")
    .select(accountFields)
    .order("created_at");
  if (error)
    throw new DomainError("STORAGE", "Không tải được danh sách nhân viên", 503);
  const members: TeamMember[] = [];
  for (const raw of data ?? []) {
    const account = asAccount(raw);
    const { data: stateRow, error: stateError } = await admin
      .from("employee_states")
      .select("state,updated_at")
      .eq("owner_id", account.user_id)
      .maybeSingle();
    if (stateError)
      throw new DomainError("STORAGE", "Không tải được dữ liệu toàn đội", 503);
    const state = stateRow?.state
      ? await store.getStateForOwner(account.user_id)
      : null;
    members.push({
      ...employeeAccount(account),
      summary: state
        ? summaryFor(state, from, to)
        : {
            ordered: "0",
            delivered: "0",
            customerDelivered: "0",
            collected: "0",
            fund: "0",
            reserved: "0",
            available: "0",
            pendingMargin: "0",
            unresolved: 0,
          },
      stateVersion: state?.version ?? 0,
      stateUpdatedAt: stateRow?.updated_at ?? null,
    });
  }
  return members;
}

async function ownedStates(): Promise<OwnedState[]> {
  const { data, error } = await admin
    .from("employee_accounts")
    .select("user_id,display_name")
    .order("created_at");
  if (error)
    throw new DomainError("STORAGE", "Không tải được dữ liệu toàn hệ thống", 503);
  const states: OwnedState[] = [];
  for (const account of data ?? []) {
    states.push({
      ownerId: account.user_id,
      ownerName: account.display_name,
      state: await store.getStateForOwner(account.user_id),
    });
  }
  return states;
}

function pageQuery(req: express.Request) {
  return {
    page: Number(req.query.page ?? 1),
    pageSize: Number(req.query.pageSize ?? 25),
  };
}

async function executeAdminCommand(
  ownerId: string,
  actor: User,
  type: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const state = await store.getStateForOwner(ownerId);
  return store.executeForOwner(
    ownerId,
    {
      type,
      payload,
      idempotencyKey: idempotencyKey || randomUUID(),
      version: state.version,
      sharedVersion: state.sharedVersion,
      inventoryVersion: state.inventoryVersion,
    },
    { id: actor.id, role: "admin" },
  );
}

type BulkAction = "trash" | "restore" | "purge";
type BulkResource = "customers" | "orders" | "products" | "users";
type BulkResult = {
  id: string;
  ownerId?: string;
  status: "success" | "skipped";
  message: string;
};
const accountHasHistory = (state: AppState) =>
  state.orders.length > 0 ||
  state.deliveries.length > 0 ||
  state.returns.length > 0 ||
  state.payments.length > 0 ||
  state.ledger.length > 0 ||
  state.programs.length > 0 ||
  state.inventoryMovements.length > 0 ||
  state.audit.length > 0 ||
  state.imports.length > 0;
async function activeAdminCount() {
  const rows = await admin
    .from("employee_accounts")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true)
    .is("deleted_at", null);
  if (rows.error)
    throw new DomainError("STORAGE", "Không kiểm tra được tài khoản quản trị", 503);
  return rows.count ?? 0;
}
async function trashAccount(target: AccountRow, actor: User) {
  assert(!target.deleted_at, "Tài khoản đã nằm trong thùng rác", "CONFLICT");
  assert(target.user_id !== actor.id, "Không thể tự xoá tài khoản quản trị");
  if (target.role === "admin")
    assert((await activeAdminCount()) > 1, "Không thể xoá quản trị viên cuối cùng");
  const now = new Date().toISOString();
  const updated = await admin
    .from("employee_accounts")
    .update({
      active: false,
      active_before_delete: target.active,
      deleted_at: now,
      deleted_by: actor.id,
      session_valid_after: now,
      updated_at: now,
    })
    .eq("user_id", target.user_id)
    .is("deleted_at", null);
  if (updated.error)
    throw new DomainError("STORAGE", "Không chuyển được tài khoản vào thùng rác", 503);
  const authUpdate = await admin.auth.admin.updateUserById(target.user_id, {
    ban_duration: "876000h",
  });
  if (authUpdate.error) {
    await admin.from("employee_accounts").update({
      active: target.active,
      active_before_delete: target.active_before_delete ?? null,
      deleted_at: target.deleted_at ?? null,
      deleted_by: target.deleted_by ?? null,
      session_valid_after: target.session_valid_after,
      updated_at: target.updated_at,
    }).eq("user_id", target.user_id);
    throw new DomainError("AUTH", "Không thể khóa tài khoản trên Supabase", 503);
  }
}
async function restoreAccount(target: AccountRow) {
  assert(target.deleted_at, "Tài khoản không nằm trong thùng rác", "CONFLICT");
  const active = target.active_before_delete ?? true;
  const updated = await admin
    .from("employee_accounts")
    .update({
      active,
      active_before_delete: null,
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", target.user_id)
    .not("deleted_at", "is", null);
  if (updated.error)
    throw new DomainError("STORAGE", "Không khôi phục được tài khoản", 503);
  const authUpdate = await admin.auth.admin.updateUserById(target.user_id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (authUpdate.error) {
    await admin.from("employee_accounts").update({
      active: false,
      active_before_delete: target.active_before_delete,
      deleted_at: target.deleted_at,
      deleted_by: target.deleted_by,
      updated_at: target.updated_at,
    }).eq("user_id", target.user_id);
    throw new DomainError("AUTH", "Không thể khôi phục tài khoản trên Supabase", 503);
  }
}
async function purgeAccount(target: AccountRow, actor: User) {
  assert(target.deleted_at, "Tài khoản phải nằm trong thùng rác", "CONFLICT");
  assert(target.user_id !== actor.id, "Không thể tự xoá tài khoản quản trị");
  if (target.role === "admin")
    assert((await activeAdminCount()) > 1, "Không thể xoá quản trị viên cuối cùng");
  assert(
    !accountHasHistory(await store.getStateForOwner(target.user_id)),
    "Tài khoản còn dữ liệu nghiệp vụ nên không thể xoá vĩnh viễn",
    "ACCOUNT_HAS_HISTORY",
  );
  const removed = await admin.auth.admin.deleteUser(target.user_id);
  if (removed.error)
    throw new DomainError("AUTH", "Không xoá được tài khoản", 503);
}
async function commitImport(
  owner: string,
  command: Command,
  actor: Session["user"],
) {
  const preview = previews.get(command.payload?.previewId);
  assert(
    preview && preview.owner === owner && preview.expires > Date.now(),
    "Bản xem trước hết hạn hoặc không thuộc tài khoản",
  );
  const state = await store.getStateForOwner(owner);
  const next = applyImport(state, command, preview.data, {
    id: actor.id,
    role: actor.role,
  });
  const committed = await store.commitStateForOwner(owner, command, next, state, {
    id: actor.id,
    role: actor.role,
  });
  if (preview.jobId)
    await admin
      .from("admin_import_jobs")
      .update({ status: "committed", updated_at: new Date().toISOString() })
      .eq("id", preview.jobId);
  return committed;
}
async function createImportPreview(owner: string, input: any, actorId = owner) {
  const { importPreview } = await import("./imports.js");
  const { filename, kind, base64 } = input;
  assert(
    typeof filename === "string" && typeof base64 === "string",
    "Thiếu tệp",
  );
  const buffer = Buffer.from(base64, "base64");
  assert(buffer.length <= 10 * 1024 * 1024, "Tệp vượt giới hạn 10MB");
  const state = await store.getStateForOwner(owner);
  try {
    const data = await importPreview(buffer, filename, kind, state.products);
    const previewId = randomUUID();
    const job = await admin
      .from("admin_import_jobs")
      .insert({
        owner_id: owner,
        actor_id: actorId,
        filename,
        kind,
        status: "previewed",
        summary: data.summary,
      })
      .select("id")
      .single();
    previews.set(previewId, {
      owner,
      data,
      expires: Date.now() + 3600000,
      jobId: job.data?.id,
    });
    return { ...data, previewId };
  } catch (error) {
    await admin.from("admin_import_jobs").insert({
      owner_id: owner,
      actor_id: actorId,
      filename,
      kind,
      status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 1000) : "Lỗi đọc tệp",
    });
    throw error;
  }
}

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, mode: "supabase", productionReady: true }),
);
app.get(
  "/api/auth/session",
  route(async (req, res) => {
    try {
      res.json({ user: (await userOf(req)).user, mode: "supabase" });
    } catch {
      res.json({ user: null, mode: "supabase" });
    }
  }),
);
app.post("/api/auth/register", (_req, res) =>
  res.status(403).json({
    error: {
      code: "REGISTRATION_DISABLED",
      message: "Chỉ quản trị viên mới được tạo tài khoản nhân viên.",
    },
  }),
);
app.post(
  "/api/auth/login",
  route(async (req, res) => {
    const {
      username,
      email,
      login,
      password,
      companyCode = "TRUECARE",
    } = req.body;
    assert(
      companyCode.toUpperCase() === "TRUECARE" && typeof password === "string",
      "Thông tin đăng nhập không hợp lệ",
      "AUTH",
    );
    const loginValue = String(login ?? username ?? email ?? "")
      .trim()
      .toLowerCase();
    const rateKey = `${req.ip}:${loginValue}`;
    assertLoginRate(rateKey);
    let account: AccountRow;
    try {
      account = await resolveLogin(loginValue);
    } catch (error) {
      failedLogin(rateKey);
      throw error;
    }
    const signed = await auth.auth.signInWithPassword({
      email: account.email,
      password,
    });
    if (signed.error || !signed.data.session) {
      failedLogin(rateKey);
      throw new DomainError("AUTH", "Thông tin đăng nhập không hợp lệ", 401);
    }
    loginAttempts.delete(rateKey);
    await admin
      .from("employee_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("user_id", account.user_id);
    setSession(res, signed.data.session.access_token);
    res.json({ user: accountUser(account), mode: "supabase" });
  }),
);
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("tc_session", { path: "/" });
  res.json({ ok: true });
});
app.post(
  "/api/auth/logout-all",
  route(async (req, res) => {
    const session = await userOf(req);
    await revokeSessions(session.user.id);
    res.clearCookie("tc_session", { path: "/" });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/auth/forgot-password",
  route(async (req, res) => {
    const account = await resolveLogin(req.body.email);
    const reset = await auth.auth.resetPasswordForEmail(account.email, {
      redirectTo: process.env.APP_ORIGIN,
    });
    if (reset.error) throw new DomainError("AUTH", reset.error.message, 400);
    res.json({ message: "Nếu email hợp lệ, hướng dẫn khôi phục đã được gửi." });
  }),
);
app.post(
  "/api/auth/change-password",
  route(async (req, res) => {
    const session = await userOf(req);
    const oldPassword = String(req.body.oldPassword ?? "");
    const newPassword = validateEmployeePassword(req.body.newPassword);
    const verified = await auth.auth.signInWithPassword({
      email: session.account.email,
      password: oldPassword,
    });
    if (verified.error || !verified.data.session)
      throw new DomainError("AUTH", "Mật khẩu hiện tại không đúng", 401);
    const updated = await admin.auth.admin.updateUserById(session.user.id, {
      password: newPassword,
    });
    if (updated.error)
      throw new DomainError("AUTH", "Không thể đổi mật khẩu lúc này", 503);
    res.json({ ok: true });
  }),
);
app.use(
  "/api",
  route(async (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    const session = await userOf(req);
    res.locals.session = session;
    next();
  }),
);
app.get(
  "/api/state",
  route(async (req, res) =>
    res.json(
      await store.getStateForOwner((res.locals.session as Session).user.id),
    ),
  ),
);
app.post(
  "/api/commands",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const command = req.body as Command;
    assert(
      typeof command.idempotencyKey === "string" &&
        command.idempotencyKey.length >= 8,
      "Cần khóa chống gửi lặp",
    );
    const sensitive = new Set([
      "saveProduct",
      "adjustInventory",
      "saveCatalog",
    ]);
    const reason =
      session.user.role === "admin" && sensitive.has(command.type)
        ? reasonOf(command.payload?.reason)
        : "";
    const result =
      command.type === "commitImport"
        ? await commitImport(session.user.id, command, session.user)
        : await store.executeForOwner(session.user.id, command, {
            id: session.user.id,
            role: session.user.role,
          });
    if (reason)
      await logAdmin(session.user.id, session.user.id, command.type, reason, {
        referenceId: String(
          command.payload?.id ?? command.payload?.product?.id ?? "",
        ),
      });
    res.json(result);
  }),
);
app.post(
  "/api/programs/preview",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    res.json(
      previewPrograms(await store.getStateForOwner(session.user.id), req.body),
    );
  }),
);
app.post(
  ["/api/imports/preview", "/api/import/preview"],
  route(async (req, res) => {
    const session = res.locals.session as Session;
    authorizeImport(String(req.body.kind), {
      id: session.user.id,
      role: session.user.role,
    });
    res.json(await createImportPreview(session.user.id, req.body));
  }),
);
app.post("/api/imports/local-preview", (_req, res) =>
  res.status(501).json({
    error: {
      code: "LOCAL_ONLY",
      message: "Bản online chỉ nhận tệp bạn tải lên.",
    },
  }),
);

app.use(
  "/api/admin",
  route(async (req, res, next) => {
    const user = (res.locals.session as Session).user;
    requireAdmin(user);
    const now = Date.now(), current = adminRequests.get(user.id);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + 60_000 }
      : current;
    bucket.count += 1;
    adminRequests.set(user.id, bucket);
    if (bucket.count > 180)
      throw new DomainError("RATE_LIMIT", "Thao tác quản trị quá nhanh. Vui lòng thử lại sau một phút.", 429);
    next();
  }),
);
app.get(
  "/api/admin/dashboard",
  route(async (_req, res) => {
    const states = await ownedStates();
    const products = states[0]?.state.products ?? [];
    res.json({
      summary: dashboardOf(states, products),
      team: await team(),
      alerts: {
        negativeFunds: states
          .filter((x) => Number(x.state.summary.available) < 0)
          .map((x) => ({ ownerId: x.ownerId, ownerName: x.ownerName, amount: x.state.summary.available })),
        lowStock: (states[0]?.state.inventory ?? [])
          .filter((x) => x.tracked && x.quantity <= 12)
          .map((x) => ({ ...x, product: products.find((p) => p.id === x.productId)?.name ?? x.productId })),
        partialOrders: states.flatMap((x) =>
          x.state.orders
            .filter((order) => !order.deletedAt && order.status === "partial")
            .map((order) => ({ ownerId: x.ownerId, ownerName: x.ownerName, order }))),
      },
    });
  }),
);

app.get(
  "/api/admin/customers",
  route(async (req, res) => {
    const states = await ownedStates();
    const customers = states[0]?.state.customers ?? [];
    const q = String(req.query.q ?? "").trim().toLocaleLowerCase("vi");
    const status = String(req.query.status ?? "active");
    const district = String(req.query.district ?? "");
    const filtered = customers
      .filter((customer) => {
        const currentStatus = customer.mergedInto
          ? "merged"
          : customer.deletedAt
            ? "deleted"
            : customer.archived
              ? "archived"
              : "active";
        return (
          (status === "all" || currentStatus === status) &&
          (!district || customer.district === district) &&
          (!q ||
            [customer.name, customer.phone, customer.address, customer.route]
              .join(" ")
              .toLocaleLowerCase("vi")
              .includes(q))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .map((customer) => ({ ...customer, usage: customerUsage(states, customer.id) }));
    res.json({ ...pageOf(filtered, pageQuery(req).page, pageQuery(req).pageSize), duplicateGroups: duplicateCustomers(customers).length });
  }),
);

app.post(
  "/api/admin/customers",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const before = await store.getStateForOwner(session.user.id);
    const next = await executeAdminCommand(
      session.user.id,
      session.user,
      "saveCustomer",
      { customer: req.body.customer, reason },
      req.header("x-idempotency-key") ?? undefined,
    );
    const created = next.customers.find((x) => !before.customers.some((old) => old.id === x.id));
    await logAdmin(session.user.id, null, "create_customer", reason, {}, {
      requestId: req.header("x-idempotency-key") ?? undefined,
      objectType: "customer",
      objectId: created?.id,
      after: created,
    });
    res.status(201).json({ customer: created, state: next });
  }),
);

app.patch(
  "/api/admin/customers/:id",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const state = await store.getStateForOwner(session.user.id);
    const before = state.customers.find((x) => x.id === req.params.id);
    assert(before, "Không tìm thấy khách hàng");
    const next = await executeAdminCommand(
      session.user.id,
      session.user,
      "saveCustomer",
      { customer: { ...before, ...req.body.customer, id: before.id }, reason },
      req.header("x-idempotency-key") ?? undefined,
    );
    const after = next.customers.find((x) => x.id === before.id);
    await logAdmin(session.user.id, null, "update_customer", reason, {}, {
      requestId: req.header("x-idempotency-key") ?? undefined,
      objectType: "customer",
      objectId: before.id,
      before,
      after,
    });
    res.json({ customer: after });
  }),
);

app.delete(
  "/api/admin/customers/:id",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const next = await executeAdminCommand(
      session.user.id,
      session.user,
      "deleteCustomer",
      { id: String(req.params.id), reason },
      req.header("x-idempotency-key") ?? undefined,
    );
    await logAdmin(session.user.id, null, "delete_customer", reason, {}, {
      requestId: req.header("x-idempotency-key") ?? undefined,
      objectType: "customer",
      objectId: String(req.params.id),
    });
    res.json({ customer: next.customers.find((x) => x.id === String(req.params.id)) });
  }),
);

app.post(
  "/api/admin/customers/:id/restore",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const next = await executeAdminCommand(session.user.id, session.user, "restoreCustomer", {
      id: String(req.params.id),
      reason,
    }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, null, "restore_customer", reason, {}, {
      objectType: "customer",
      objectId: String(req.params.id),
    });
    res.json({ customer: next.customers.find((x) => x.id === String(req.params.id)) });
  }),
);

app.delete(
  "/api/admin/customers/:id/purge",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const states = await ownedStates();
    const usage = customerUsage(states, String(req.params.id));
    assert(usage.orders === 0 && usage.visits === 0, "Khách hàng còn lịch sử nên chỉ có thể lưu trong thùng rác", "CUSTOMER_HAS_HISTORY");
    await executeAdminCommand(session.user.id, session.user, "purgeCustomer", {
      id: String(req.params.id),
      reason,
    }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, null, "purge_customer", reason, { usage }, {
      objectType: "customer",
      objectId: String(req.params.id),
    });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/admin/customers/:id/merge",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const targetId = String(req.body.targetId ?? "");
    assert(targetId && targetId !== req.params.id, "Khách nhận dữ liệu không hợp lệ");
    const requestId = req.header("x-idempotency-key") || randomUUID();
    const result = await admin.rpc("admin_merge_customer", {
      p_source: String(req.params.id),
      p_target: targetId,
      p_actor: session.user.id,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (result.error)
      throw new DomainError("STORAGE", "Không thể gộp khách hàng: " + result.error.message, 409);
    await logAdmin(session.user.id, null, "merge_customer", reason, { targetId }, {
      requestId,
      objectType: "customer",
      objectId: String(req.params.id),
    });
    res.json({ ok: true, targetId });
  }),
);

app.get(
  "/api/admin/orders",
  route(async (req, res) => {
    const states = await ownedStates();
    const q = String(req.query.q ?? "").toLocaleLowerCase("vi");
    const status = String(req.query.status ?? "all");
    const ownerId = String(req.query.ownerId ?? "");
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const rows = states
      .filter((owned) => !ownerId || owned.ownerId === ownerId)
      .flatMap((owned) =>
        owned.state.orders.map((order) => ({
          ...order,
          ownerId: owned.ownerId,
          ownerName: owned.ownerName,
          customerName: owned.state.customers.find((x) => x.id === order.customerId)?.name ?? "Khách đã xoá",
        })),
      )
      .filter((order) =>
        (status === "all" || (status === "trash" ? !!order.deletedAt && !order.purgedAt : order.status === status)) &&
        (!from || order.date >= from) && (!to || order.date <= to) &&
        (!q || [order.code, order.customerName, order.ownerName].join(" ").toLocaleLowerCase("vi").includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
    res.json(pageOf(rows, pageQuery(req).page, pageQuery(req).pageSize));
  }),
);

app.get(
  "/api/admin/products",
  route(async (req, res) => {
    const states = await ownedStates();
    const products = states[0]?.state.products ?? [];
    const normalized = await admin.from("products").select("id,data");
    if (normalized.error)
      throw new DomainError("STORAGE", "Không tải được bảng giá quản trị", 503);
    const pending = new Map((normalized.data ?? []).map((row) => [row.id, row.data]));
    const q = String(req.query.q ?? "").toLocaleLowerCase("vi");
    const status = String(req.query.status ?? "active");
    const rows = products
      .filter((product) => {
        const currentStatus = product.deletedAt
          ? "deleted"
          : product.archived
            ? "archived"
            : "active";
        return (
          (status === "all" || status === currentStatus) &&
          (!q || [product.code, product.name, product.brand, product.group].join(" ").toLocaleLowerCase("vi").includes(q))
        );
      })
      .map((product) => ({
        ...product,
        scheduled:
          pending.get(product.id)?.effectiveDate > new Date().toISOString().slice(0, 10)
            ? pending.get(product.id)
            : null,
        usage: productUsage(states, product.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    res.json(pageOf(rows, pageQuery(req).page, pageQuery(req).pageSize));
  }),
);

app.post(
  "/api/admin/orders/:ownerId/:id/restore",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const ownerId = String(req.params.ownerId), orderId = String(req.params.id);
    const next = await executeAdminCommand(ownerId, session.user, "restoreOrder", { id: orderId, reason }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, ownerId, "restore_order", reason, {}, { objectType: "order", objectId: orderId });
    res.json({ order: next.orders.find((x) => x.id === orderId) });
  }),
);

app.delete(
  "/api/admin/orders/:ownerId/:id/purge",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const ownerId = String(req.params.ownerId), orderId = String(req.params.id);
    await executeAdminCommand(ownerId, session.user, "purgeOrder", { id: orderId, reason }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, ownerId, "purge_order", reason, {}, { objectType: "order", objectId: orderId });
    res.json({ ok: true });
  }),
);

app.get(
  "/api/admin/products/:id/prices",
  route(async (req, res) => {
    const { data, error } = await admin
      .from("product_prices")
      .select("id,cost,quote_price,pack,effective_date,changed_by,reason,created_at")
      .eq("product_id", req.params.id)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new DomainError("STORAGE", "Không tải được lịch sử giá", 503);
    res.json({ entries: data ?? [] });
  }),
);

app.put(
  "/api/admin/catalogs/:kind",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const state = await store.getStateForOwner(session.user.id);
    const kind = String(req.params.kind);
    assert(kind in (state.catalogs ?? {}), "Danh mục không hợp lệ");
    const before = (state.catalogs as any)[kind];
    assert(Array.isArray(req.body.values), "Danh mục không hợp lệ");
    const values = [...new Set(req.body.values.map((x: unknown) => String(x).trim()).filter(Boolean))];
    const states = await ownedStates();
    const removed = (before as string[]).filter((value) => !values.includes(value));
    const inUse = removed.filter(
      (value) =>
        catalogUsage(states, state.products, state.customers, kind, value) > 0,
    );
    assert(
      inUse.length === 0,
      `Không thể xoá mục đang được sử dụng: ${inUse.join(", ")}`,
      "CATALOG_IN_USE",
    );
    const next = await executeAdminCommand(session.user.id, session.user, "saveCatalog", {
      [kind]: values,
      reason,
    }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, null, "update_catalog", reason, { kind }, {
      objectType: "catalog",
      objectId: kind,
      before,
      after: (next.catalogs as any)?.[kind],
    });
    res.json({ values: (next.catalogs as any)?.[kind] });
  }),
);

app.get(
  "/api/admin/catalogs",
  route(async (_req, res) => {
    const states = await ownedStates();
    const state = states[0]?.state;
    const catalogs = state?.catalogs ?? {};
    const entries = Object.entries(catalogs).flatMap(([kind, values]) =>
      (values as string[]).map((value, position) => ({
        id: `${kind}:${position}`,
        kind,
        value,
        position,
        usage: catalogUsage(states, state?.products ?? [], state?.customers ?? [], kind, value),
      })),
    );
    res.json({ catalogs, entries });
  }),
);

app.post(
  "/api/admin/catalogs/:kind/rename",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const kind = String(req.params.kind);
    const oldValue = String(req.body.oldValue ?? "");
    const newValue = String(req.body.newValue ?? "");
    const next = await executeAdminCommand(session.user.id, session.user, "renameCatalog", {
      kind,
      oldValue,
      newValue,
      reason,
    }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, null, "rename_catalog", reason, { oldValue, newValue }, {
      objectType: "catalog",
      objectId: kind,
    });
    res.json({ values: (next.catalogs as any)?.[kind] });
  }),
);

app.get(
  "/api/admin/inventory",
  route(async (req, res) => {
    const states = await ownedStates();
    const state = states[0]?.state;
    const q = String(req.query.q ?? "").toLocaleLowerCase("vi");
    const products = state?.products ?? [];
    const balances = (state?.inventory ?? [])
      .map((balance) => ({ ...balance, product: products.find((x) => x.id === balance.productId) }))
      .filter((x) => !q || [x.product?.code, x.product?.name].join(" ").toLocaleLowerCase("vi").includes(q));
    const movements = await admin
      .from("inventory_movements")
      .select("id,owner_id,product_id,movement_date,quantity,reason,reference_id,created_at")
      .order("movement_date", { ascending: false })
      .limit(500);
    if (movements.error) throw new DomainError("STORAGE", "Không tải được lịch sử kho", 503);
    res.json({ balances, movements: movements.data ?? [], version: state?.inventoryVersion ?? 0 });
  }),
);

app.post(
  "/api/admin/inventory/adjust",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const next = await executeAdminCommand(session.user.id, session.user, "adjustInventory", {
      productId: req.body.productId,
      mode: req.body.mode,
      quantity: Number(req.body.quantity),
      tracked: req.body.tracked !== false,
      reason,
    }, req.header("x-idempotency-key") ?? undefined);
    await logAdmin(session.user.id, null, "adjust_company_inventory", reason, {
      productId: req.body.productId,
      mode: req.body.mode,
      quantity: Number(req.body.quantity),
    }, { objectType: "inventory", objectId: req.body.productId });
    res.json({ inventory: next.inventory });
  }),
);

app.get(
  "/api/admin/funds",
  route(async (req, res) => {
    const states = await ownedStates();
    const ownerId = String(req.query.ownerId ?? "");
    const rows = states
      .filter((x) => !ownerId || x.ownerId === ownerId)
      .flatMap((owned) => owned.state.ledger.map((entry) => ({ ...entry, ownerId: owned.ownerId, ownerName: owned.ownerName })))
      .sort((a, b) => b.date.localeCompare(a.date));
    res.json(pageOf(rows, pageQuery(req).page, pageQuery(req).pageSize));
  }),
);

app.get(
  "/api/admin/programs",
  route(async (req, res) => {
    const states = await ownedStates();
    const status = String(req.query.status ?? "all");
    const rows = states
      .flatMap((owned) => owned.state.programs.map((program) => ({ ...program, ownerId: owned.ownerId, ownerName: owned.ownerName })))
      .filter((program) => status === "all" || program.status === status)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
    res.json(pageOf(rows, pageQuery(req).page, pageQuery(req).pageSize));
  }),
);

app.get(
  "/api/admin/imports",
  route(async (req, res) => {
    const { data, error, count } = await admin
      .from("admin_import_jobs")
      .select("id,owner_id,actor_id,filename,kind,status,summary,error_message,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((pageQuery(req).page - 1) * pageQuery(req).pageSize, pageQuery(req).page * pageQuery(req).pageSize - 1);
    if (error) throw new DomainError("STORAGE", "Không tải được lịch sử nhập dữ liệu", 503);
    res.json({ items: data ?? [], total: count ?? 0, ...pageQuery(req) });
  }),
);

app.get(
  "/api/admin/system/health",
  route(async (_req, res) => {
    const started = Date.now();
    const probe = await admin.from("employee_accounts").select("user_id", { count: "exact", head: true });
    res.json({
      api: "ok",
      database: probe.error ? "error" : "ok",
      latencyMs: Date.now() - started,
      deployment: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
      runtime: process.version,
      registration: "disabled",
    });
  }),
);
app.get(
  "/api/admin/team",
  route(async (req, res) =>
    res.json({
      members: await team(
        req.query.from as string | undefined,
        req.query.to as string | undefined,
      ),
    }),
  ),
);
app.get(
  "/api/admin/workspaces/:userId",
  route(async (req, res) => {
    const target = await accountOf(String(req.params.userId));
    res.json({
      account: employeeAccount(target),
      state: await store.getStateForOwner(target.user_id),
    });
  }),
);
app.post(
  "/api/admin/workspaces/:userId/commands",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    assert(!target.deleted_at, "Tài khoản đang nằm trong thùng rác", "CONFLICT");
    const reason = reasonOf(req.body.reason);
    const command = req.body.command as Command;
    assert(
      command && typeof command.idempotencyKey === "string",
      "Thiếu thao tác quản trị",
    );
    if (
      ["deleteOrder", "restoreOrder", "purgeOrder", "reviseOrder"].includes(
        command.type,
      )
    )
      command.payload = { ...command.payload, reason };
    const next =
      command.type === "commitImport"
        ? await commitImport(target.user_id, command, session.user)
        : await store.executeForOwner(target.user_id, command, {
            id: session.user.id,
            role: "admin",
          });
    await logAdmin(
      session.user.id,
      target.user_id,
      "workspace_command",
      reason,
      {
        command: command.type,
        referenceId: String(
          command.payload?.id ??
            command.payload?.orderId ??
            command.payload?.order?.id ??
            "",
        ),
      },
    );
    res.json(next);
  }),
);
app.post(
  "/api/admin/workspaces/:userId/programs/preview",
  route(async (req, res) => {
    const target = await accountOf(String(req.params.userId));
    res.json(
      previewPrograms(await store.getStateForOwner(target.user_id), req.body),
    );
  }),
);
app.post(
  "/api/admin/workspaces/:userId/imports/preview",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    res.json(await createImportPreview(target.user_id, req.body, session.user.id));
  }),
);
app.post(
  "/api/admin/users",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const created = await createEmployee(req.body);
    await logAdmin(
      session.user.id,
      created.user_id,
      "create_employee",
      reason,
      { username: created.username, email: created.email },
    );
    res.status(201).json({ account: employeeAccount(created) });
  }),
);
app.patch(
  "/api/admin/users/:userId",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    assert(!target.deleted_at, "Tài khoản đang nằm trong thùng rác", "CONFLICT");
    const reason = reasonOf(req.body.reason);
    const username =
      req.body.username === undefined
        ? target.username
        : normalizeUsername(req.body.username);
    const displayName =
      req.body.displayName === undefined
        ? target.display_name
        : String(req.body.displayName).trim();
    const email =
      req.body.email === undefined ? target.email : normalizeEmail(req.body.email);
    assert(
      displayName && displayName.length <= 120,
      "Tên hiển thị không hợp lệ",
    );
    const active =
      req.body.active === undefined ? target.active : !!req.body.active;
    if (target.user_id === session.user.id)
      assert(active, "Không thể tự khóa tài khoản quản trị");
    if (target.role === "admin" && !active) {
      const activeAdmins = await admin
        .from("employee_accounts")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true);
      assert((activeAdmins.count ?? 0) > 1, "Không thể khóa quản trị viên cuối cùng");
    }
    const { error } = await admin
      .from("employee_accounts")
      .update({
        username,
        email,
        display_name: displayName,
        active,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", target.user_id);
    if (error)
      throw new DomainError(
        "AUTH",
        error.code === "23505"
          ? "Tên đăng nhập đã tồn tại"
          : "Không cập nhật được tài khoản",
        400,
      );
    const authUpdate = await admin.auth.admin.updateUserById(target.user_id, {
      email,
      email_confirm: true,
      user_metadata: { username, displayName },
      ban_duration: active ? "none" : "876000h",
    });
    if (authUpdate.error) {
      await admin
        .from("employee_accounts")
        .update({
          username: target.username,
          email: target.email,
          display_name: target.display_name,
          active: target.active,
          updated_at: target.updated_at,
        })
        .eq("user_id", target.user_id);
      throw new DomainError(
        "AUTH",
        "Không cập nhật được trạng thái Supabase",
        503,
      );
    }
    const updated = await accountOf(target.user_id);
    await logAdmin(session.user.id, target.user_id, "update_employee", reason, {
      username,
      displayName,
      active,
      email,
    });
    res.json({ account: employeeAccount(updated) });
  }),
);
app.post(
  "/api/admin/users/:userId/reset-password",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    assert(!target.deleted_at, "Tài khoản đang nằm trong thùng rác", "CONFLICT");
    const reason = reasonOf(req.body.reason);
    const password = validateEmployeePassword(req.body.password);
    const result = await admin.auth.admin.updateUserById(target.user_id, {
      password,
    });
    if (result.error)
      throw new DomainError("AUTH", "Không đặt lại được mật khẩu", 400);
    await logAdmin(
      session.user.id,
      target.user_id,
      "reset_password",
      reason,
      {},
    );
    res.json({ ok: true });
  }),
);
app.post(
  "/api/admin/users/:userId/revoke-sessions",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    assert(!target.deleted_at, "Tài khoản đang nằm trong thùng rác", "CONFLICT");
    const reason = reasonOf(req.body.reason);
    const sessionValidAfter = await revokeSessions(target.user_id);
    await logAdmin(session.user.id, target.user_id, "revoke_sessions", reason, {
      sessionValidAfter,
    });
    if (target.user_id === session.user.id)
      res.clearCookie("tc_session", { path: "/" });
    res.json({ ok: true });
  }),
);
app.delete(
  "/api/admin/users/:userId",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    const reason = reasonOf(req.body.reason);
    await trashAccount(target, session.user);
    await logAdmin(session.user.id, target.user_id, "trash_employee", reason, {
      username: target.username,
    });
    res.json({ ok: true, status: "trash" });
  }),
);

app.post(
  "/api/admin/:resource/bulk-actions",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const resource = String(req.params.resource) as BulkResource;
    const action = String(req.body.action) as BulkAction;
    const reason = reasonOf(req.body.reason);
    const key = String(req.body.idempotencyKey ?? req.header("x-idempotency-key") ?? "");
    const rawItems = req.body.items;
    assert(["customers", "orders", "products", "users"].includes(resource), "Loại dữ liệu không hỗ trợ");
    assert(["trash", "restore", "purge"].includes(action), "Thao tác không hỗ trợ");
    assert(typeof key === "string" && key.length >= 8 && key.length <= 200, "Cần khóa chống gửi lặp");
    assert(Array.isArray(rawItems) && rawItems.length >= 1 && rawItems.length <= 25, "Mỗi lần chọn từ 1 đến 25 dòng");
    const items = rawItems.map((item: any) => ({
      id: String(item?.id ?? item),
      ownerId: item?.ownerId == null ? undefined : String(item.ownerId),
    }));
    assert(items.every((item) => item.id && (resource !== "orders" || item.ownerId)), "Dữ liệu lựa chọn không hợp lệ");
    assert(new Set(items.map((item) => `${item.ownerId ?? ""}:${item.id}`)).size === items.length, "Danh sách có dòng trùng");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ actor: session.user.id, resource, action, items, reason }))
      .digest("hex");
    const receipt = await admin
      .from("admin_bulk_operations")
      .select("fingerprint,status,result")
      .eq("request_id", key)
      .maybeSingle();
    if (receipt.error)
      throw new DomainError("STORAGE", "Không kiểm tra được khóa chống gửi lặp", 503);
    if (receipt.data) {
      assert(receipt.data.fingerprint === fingerprint, "Khóa chống gửi lặp đã dùng cho dữ liệu khác", "CONFLICT");
      assert(receipt.data.status === "complete", "Thao tác này đang được xử lý", "CONFLICT");
      res.json(receipt.data.result);
      return;
    }
    const started = await admin.from("admin_bulk_operations").insert({
      request_id: key,
      actor_id: session.user.id,
      resource,
      action,
      fingerprint,
      status: "processing",
    });
    if (started.error) {
      if (started.error.code === "23505")
        throw new DomainError("CONFLICT", "Thao tác này đang được xử lý", 409);
      throw new DomainError("STORAGE", "Không bắt đầu được thao tác hàng loạt", 503);
    }
    const results: BulkResult[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      try {
        let before: unknown;
        let after: unknown;
        if (resource === "customers") {
          const type = action === "trash" ? "deleteCustomer" : action === "restore" ? "restoreCustomer" : "purgeCustomer";
          const current = await store.getStateForOwner(session.user.id);
          before = current.customers.find((customer) => customer.id === item.id);
          if (action === "purge") {
            const usage = customerUsage(await ownedStates(), item.id);
            assert(usage.orders === 0 && usage.visits === 0, "Khách hàng còn lịch sử nên không thể xoá vĩnh viễn", "CUSTOMER_HAS_HISTORY");
          }
          const next = await executeAdminCommand(session.user.id, session.user, type, { id: item.id, reason }, `${key}:${index}`);
          after = next.customers.find((customer) => customer.id === item.id);
        } else if (resource === "products") {
          const type = action === "trash" ? "deleteProduct" : action === "restore" ? "restoreProduct" : "purgeProduct";
          const current = await store.getStateForOwner(session.user.id);
          before = current.products.find((product) => product.id === item.id);
          const next = await executeAdminCommand(session.user.id, session.user, type, { id: item.id, reason }, `${key}:${index}`);
          after = next.products.find((product) => product.id === item.id);
        } else if (resource === "orders") {
          const type = action === "trash" ? "deleteOrder" : action === "restore" ? "restoreOrder" : "purgeOrder";
          const current = await store.getStateForOwner(item.ownerId!);
          before = current.orders.find((order) => order.id === item.id);
          const next = await executeAdminCommand(item.ownerId!, session.user, type, { id: item.id, reason }, `${key}:${index}`);
          after = next.orders.find((order) => order.id === item.id);
        } else {
          const target = await accountOf(item.id);
          before = employeeAccount(target);
          if (action === "trash") await trashAccount(target, session.user);
          else if (action === "restore") await restoreAccount(target);
          else await purgeAccount(target, session.user);
          after = action === "purge" ? null : employeeAccount(await accountOf(item.id));
        }
        await logAdmin(session.user.id, resource === "orders" ? item.ownerId! : resource === "users" && action !== "purge" ? item.id : null, `${action}_${resource}`, reason, {}, {
          requestId: `${key}:${index}`,
          objectType: resource,
          objectId: item.id,
          before,
          after,
        });
        results.push({ ...item, status: "success", message: action === "trash" ? "Đã chuyển vào thùng rác" : action === "restore" ? "Đã khôi phục" : "Đã xoá vĩnh viễn" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không thực hiện được";
        await logAdmin(session.user.id, null, `${action}_${resource}_blocked`, reason, { message, ownerId: item.ownerId }, {
          requestId: `${key}:${index}:blocked`,
          objectType: resource,
          objectId: item.id,
        });
        results.push({ ...item, status: "skipped", message });
      }
    }
    const result = {
      successCount: results.filter((item) => item.status === "success").length,
      skippedCount: results.filter((item) => item.status === "skipped").length,
      results,
    };
    const completed = await admin
      .from("admin_bulk_operations")
      .update({ status: "complete", result, completed_at: new Date().toISOString() })
      .eq("request_id", key);
    if (completed.error)
      throw new DomainError("STORAGE", "Đã xử lý dữ liệu nhưng chưa lưu được biên nhận", 503);
    res.json(result);
  }),
);
app.post(
  "/api/admin/catalog/bulk-price",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const state = await store.getStateForOwner(session.user.id);
    const match = req.body.match ?? {};
    const products = state.products.filter(
      (product) =>
        (match.code && product.code === String(match.code)) ||
        (match.name && product.name === String(match.name)),
    );
    assert(
      products.length === 1,
      "Không xác định duy nhất sản phẩm trong danh mục chung",
    );
    const patch = req.body.patch ?? {};
    assert(
      ["cost", "price", "pack", "effectiveDate"].some(
        (key) => patch[key] !== undefined,
      ),
      "Chưa có thay đổi bảng giá",
    );
    const product = { ...products[0], ...patch };
    const next = await executeAdminCommand(
      session.user.id,
      session.user,
      "saveProduct",
      { product, reason },
      req.header("x-idempotency-key") ?? undefined,
    );
    await logAdmin(session.user.id, null, "shared_catalog_price", reason, {
      productId: product.id,
      code: product.code,
      patch,
      scope: "company",
    }, { objectType: "product", objectId: product.id, before: products[0], after: product });
    res.json({ product, sharedVersion: next.sharedVersion });
  }),
);
app.get(
  "/api/admin/audit",
  route(async (req, res) => {
    const { page, pageSize } = pageQuery(req);
    let query = admin
      .from("admin_audit_logs")
      .select("id,actor_id,target_user_id,action,reason,details,request_id,object_type,object_id,before_data,after_data,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (req.query.action) query = query.eq("action", String(req.query.action));
    if (req.query.actorId) query = query.eq("actor_id", String(req.query.actorId));
    if (req.query.targetId) query = query.eq("target_user_id", String(req.query.targetId));
    if (req.query.objectType) query = query.eq("object_type", String(req.query.objectType));
    if (req.query.from) query = query.gte("created_at", String(req.query.from));
    if (req.query.to) query = query.lte("created_at", String(req.query.to) + "T23:59:59.999Z");
    if (req.query.q) query = query.ilike("reason", `%${String(req.query.q).slice(0, 120)}%`);
    const { data, error, count } = await query;
    if (error)
      throw new DomainError("STORAGE", "Không tải được nhật ký quản trị", 503);
    const accounts = await team();
    const names = new Map(accounts.map((x) => [x.id, x.displayName]));
    res.json({
      entries: (data ?? []).map((entry) => ({
        ...entry,
        actor_name: names.get(entry.actor_id) ?? "Tài khoản đã xoá",
        target_name: entry.target_user_id ? names.get(entry.target_user_id) ?? "Tài khoản đã xoá" : "Hệ thống",
      })),
      page,
      pageSize,
      total: count ?? 0,
      pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    });
  }),
);

app.use(
  express.static(path.resolve("dist"), {
    index: "index.html",
    fallthrough: true,
  }),
);
app.get(/.*/, (req, res) => res.sendFile(path.resolve("dist/index.html")));
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      "TrueCare API error:",
      error instanceof Error ? error.message : error,
    );
    const known = error instanceof DomainError;
    res
      .status(known ? (error.code === "CONFLICT" ? 409 : error.status) : 500)
      .json({
        error: {
          code: known ? error.code : "SERVER_ERROR",
          message: known
            ? error.message
            : "Không thể hoàn tất thao tác. Dữ liệu chưa bị thay đổi.",
        },
      });
  },
);
export function startProduction() {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, "0.0.0.0", () =>
    console.log(`TrueCare production: ${port}`),
  );
}
startProduction();
