import express from "express";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { previewPrograms, DomainError, assert } from "./domain.js";
import { createSupabaseAdapter } from "./supabase-adapter.js";
import {
  accountUser,
  normalizeEmail,
  normalizeUsername,
  requireAdmin,
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
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createSupabaseAdapter(url, serviceKey);
const previews = new Map<
  string,
  { owner: string; data: any; expires: number }
>();
type Session = { token: string; user: User; account: AccountRow };
const accountFields =
  "user_id,email,username,display_name,role,active,created_at,updated_at";
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
  return { token, user: accountUser(account), account };
};
const logAdmin = async (
  actor: string,
  target: string | null,
  action: string,
  reason: string,
  details: Record<string, unknown> = {},
) => {
  const { error } = await admin.from("admin_audit_logs").insert({
    id: randomUUID(),
    actor_id: actor,
    target_user_id: target,
    action,
    reason,
    details,
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
  return store.commitStateForOwner(owner, command, next, state);
}
async function createImportPreview(owner: string, input: any) {
  const { importPreview } = await import("./imports.js");
  const { filename, kind, base64 } = input;
  assert(
    typeof filename === "string" && typeof base64 === "string",
    "Thiếu tệp",
  );
  const buffer = Buffer.from(base64, "base64");
  assert(buffer.length <= 10 * 1024 * 1024, "Tệp vượt giới hạn 10MB");
  const state = await store.getStateForOwner(owner);
  const data = await importPreview(buffer, filename, kind, state.products);
  const previewId = randomUUID();
  previews.set(previewId, { owner, data, expires: Date.now() + 3600000 });
  return { ...data, previewId };
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
    const account = await resolveLogin(login ?? username ?? email);
    const signed = await auth.auth.signInWithPassword({
      email: account.email,
      password,
    });
    if (signed.error || !signed.data.session)
      throw new DomainError("AUTH", "Thông tin đăng nhập không hợp lệ", 401);
    setSession(res, signed.data.session.access_token);
    res.json({ user: accountUser(account), mode: "supabase" });
  }),
);
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("tc_session", { path: "/" });
  res.json({ ok: true });
});
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
    requireAdmin((res.locals.session as Session).user);
    next();
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
    const target = await accountOf(String(req.params.userId));
    res.json(await createImportPreview(target.user_id, req.body));
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
    const reason = reasonOf(req.body.reason);
    const username =
      req.body.username === undefined
        ? target.username
        : normalizeUsername(req.body.username);
    const displayName =
      req.body.displayName === undefined
        ? target.display_name
        : String(req.body.displayName).trim();
    assert(
      displayName && displayName.length <= 120,
      "Tên hiển thị không hợp lệ",
    );
    const active =
      req.body.active === undefined ? target.active : !!req.body.active;
    if (target.user_id === session.user.id)
      assert(active, "Không thể tự khóa tài khoản quản trị");
    const { error } = await admin
      .from("employee_accounts")
      .update({
        username,
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
      user_metadata: { username, displayName },
      ban_duration: active ? "none" : "876000h",
    });
    if (authUpdate.error)
      throw new DomainError(
        "AUTH",
        "Không cập nhật được trạng thái Supabase",
        503,
      );
    const updated = await accountOf(target.user_id);
    await logAdmin(session.user.id, target.user_id, "update_employee", reason, {
      username,
      displayName,
      active,
    });
    res.json({ account: employeeAccount(updated) });
  }),
);
app.post(
  "/api/admin/users/:userId/reset-password",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
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
app.delete(
  "/api/admin/users/:userId",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const target = await accountOf(String(req.params.userId));
    assert(
      target.user_id !== session.user.id,
      "Không thể tự xóa tài khoản quản trị",
    );
    const reason = reasonOf(req.body.reason);
    const state = await store.getStateForOwner(target.user_id);
    const hasHistory =
      state.orders.length > 0 ||
      state.deliveries.length > 0 ||
      state.returns.length > 0 ||
      state.payments.length > 0 ||
      state.ledger.length > 0 ||
      state.inventoryMovements.length > 0 ||
      state.audit.length > 0 ||
      state.imports.length > 0;
    assert(
      !hasHistory,
      "Tài khoản đã có giao dịch; hãy khóa tài khoản để giữ lịch sử",
      "ACCOUNT_HAS_HISTORY",
    );
    const result = await admin.auth.admin.deleteUser(target.user_id);
    if (result.error)
      throw new DomainError("AUTH", "Không xóa được tài khoản", 400);
    await logAdmin(session.user.id, target.user_id, "delete_employee", reason, {
      username: target.username,
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/admin/catalog/bulk-price",
  route(async (req, res) => {
    const session = res.locals.session as Session;
    const reason = reasonOf(req.body.reason);
    const rawIds: unknown[] = Array.isArray(req.body.userIds)
      ? (req.body.userIds as unknown[])
      : [];
    const userIds: string[] = [
      ...new Set(rawIds.filter((x): x is string => typeof x === "string")),
    ];
    assert(
      userIds.length > 0 && userIds.length <= 100,
      "Chọn từ 1 đến 100 nhân viên",
    );
    const target = await accountOf(userIds[0]);
    const state = await store.getStateForOwner(target.user_id);
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
    const next = await store.executeForOwner(
      target.user_id,
      {
        type: "saveProduct",
        payload: { product },
        idempotencyKey: randomUUID(),
        version: state.version,
        sharedVersion: state.sharedVersion,
      },
      { id: session.user.id, role: "admin" },
    );
    await logAdmin(session.user.id, null, "shared_catalog_price", reason, {
      productId: product.id,
      code: product.code,
      patch,
      userIds,
    });
    res.json({
      results: userIds.map((userId) => ({
        userId,
        version: next.sharedVersion,
      })),
    });
  }),
);
app.get(
  "/api/admin/audit",
  route(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const { data, error } = await admin
      .from("admin_audit_logs")
      .select("id,actor_id,target_user_id,action,reason,details,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error)
      throw new DomainError("STORAGE", "Không tải được nhật ký quản trị", 503);
    res.json({ entries: data ?? [] });
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
