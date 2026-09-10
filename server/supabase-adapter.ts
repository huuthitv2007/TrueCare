import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { emptyState, execute, refresh, DomainError, assert } from "./domain.js";
import {
  attachDirectory,
  directoryOf,
  type Directory,
} from "./shared-directory.js";
import { defaultCatalogs } from "../shared/catalogs.js";
import type { Actor } from "./order-lifecycle.js";
import type { AppState, Command } from "../shared/types.js";

export function createSupabaseAdapter(url: string, serviceKey: string) {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function ownerOf(jwt: string) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user)
      throw new DomainError("AUTH", "Phiên đăng nhập không hợp lệ", 401);
    return data.user.id;
  }
  async function actorOf(owner: string): Promise<Actor> {
    const { data, error } = await admin
      .from("employee_accounts")
      .select("role,active")
      .eq("user_id", owner)
      .single();
    if (error || !data?.active)
      throw new DomainError("AUTH", "Tài khoản không hoạt động", 403);
    return { id: owner, role: data.role };
  }
  async function stateOf(owner: string): Promise<AppState> {
    const { data, error } = await admin
      .from("employee_states")
      .select("state")
      .eq("owner_id", owner)
      .maybeSingle();
    if (error) throw new DomainError("STORAGE", "Không đọc được dữ liệu", 503);
    if (!data) {
      const state = emptyState();
      const inserted = await admin
        .from("employee_states")
        .insert({ owner_id: owner, state, version: 0 });
      if (inserted.error && inserted.error.code !== "23505")
        throw new DomainError("STORAGE", "Không khởi tạo được dữ liệu", 503);
      return stateOf(owner);
    }
    const common = await admin
      .from("shared_directory")
      .select("data,version")
      .eq("id", true)
      .single();
    if (common.error && ["PGRST205", "42P01"].includes(common.error.code)) {
      const legacy = structuredClone(data.state) as AppState;
      delete legacy.sharedVersion;
      return refresh(legacy);
    }
    if (common.error)
      throw new DomainError(
        "STORAGE",
        "Chưa tải được danh mục chung; cần migration tương thích",
        503,
      );
    const directory = {
      ...common.data.data,
      catalogs: { ...defaultCatalogs, ...common.data.data.catalogs },
    } as Directory;
    return refresh(attachDirectory(data.state, directory, common.data.version));
  }
  const fingerprint = (command: Command) =>
    createHash("sha256")
      .update(JSON.stringify({ type: command.type, payload: command.payload }))
      .digest("hex");
  async function commitForOwner(
    owner: string,
    command: Command,
    next: AppState,
    current?: AppState,
  ) {
    assert(command.version !== undefined, "Thiếu phiên bản dữ liệu");
    assert(
      typeof command.idempotencyKey === "string" &&
        command.idempotencyKey.length >= 8,
      "Thiếu khoá chống lặp",
    );
    if (next.sharedVersion === undefined) {
      const legacy = await admin.rpc("commit_employee_command", {
        p_owner: owner,
        p_expected: command.version,
        p_key: command.idempotencyKey,
        p_fingerprint: fingerprint(command),
        p_state: next,
      });
      if (legacy.error)
        throw new DomainError(
          legacy.error.message.includes("CONFLICT") ? "CONFLICT" : "STORAGE",
          legacy.error.message.includes("CONFLICT")
            ? "Dữ liệu đã thay đổi. Vui lòng tải lại."
            : "Chưa lưu được thao tác",
          legacy.error.message.includes("CONFLICT") ? 409 : 503,
        );
      return refresh(legacy.data as AppState);
    }
    const commonChanged =
      !current ||
      JSON.stringify(directoryOf(current)) !==
        JSON.stringify(directoryOf(next));
    const { data, error } = await admin.rpc("commit_workspace_command", {
      p_owner: owner,
      p_expected: command.version,
      p_key: command.idempotencyKey,
      p_fingerprint: fingerprint(command),
      p_state: next,
      p_shared_expected: next.sharedVersion,
      p_directory: commonChanged ? directoryOf(next) : null,
    });
    if (error)
      throw new DomainError(
        error.message.includes("CONFLICT") ? "CONFLICT" : "STORAGE",
        error.message.includes("CONFLICT")
          ? "Dữ liệu hoặc danh mục đã thay đổi. Vui lòng tải lại."
          : "Chưa lưu được thao tác",
        error.message.includes("CONFLICT") ? 409 : 503,
      );
    return refresh(data as AppState);
  }
  async function executeForOwner(
    owner: string,
    command: Command,
    actor?: Actor,
  ) {
    const verified = await actorOf(actor?.id ?? owner);
    assert(
      owner === verified.id || verified.role === "admin",
      "Không được truy cập dữ liệu người khác",
      "FORBIDDEN",
    );
    assert(
      typeof command.idempotencyKey === "string" &&
        command.idempotencyKey.length >= 8,
      "Thiếu khoá chống lặp",
    );
    const prior = await admin
      .from("command_receipts")
      .select("fingerprint")
      .eq("owner_id", owner)
      .eq("command_key", command.idempotencyKey)
      .maybeSingle();
    if (prior.error)
      throw new DomainError(
        "STORAGE",
        "Không kiểm tra được khoá chống lặp",
        503,
      );
    if (prior.data) {
      assert(
        prior.data.fingerprint === fingerprint(command),
        "Khoá chống lặp đã dùng cho dữ liệu khác",
        "CONFLICT",
      );
      return stateOf(owner);
    }
    const current = await stateOf(owner);
    if (current.sharedVersion !== undefined)
      assert(
        command.sharedVersion === current.sharedVersion,
        "Danh mục chung đã thay đổi. Vui lòng tải lại.",
        "CONFLICT",
      );
    const next = execute(current, command, verified);
    return commitForOwner(owner, command, next, current);
  }
  return {
    async getState(jwt: string) {
      return stateOf(await ownerOf(jwt));
    },
    async execute(jwt: string, command: Command) {
      return executeForOwner(await ownerOf(jwt), command);
    },
    getStateForOwner: stateOf,
    executeForOwner,
    commitStateForOwner: commitForOwner,
  };
}
