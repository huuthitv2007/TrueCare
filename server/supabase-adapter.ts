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
import { businessDate } from "../shared/business-date.js";
import type { AppState, Command } from "../shared/types.js";

export function createSupabaseAdapter(url: string, serviceKey: string) {
  async function allRows(factory: () => any): Promise<{ data: any[]; error: any }> {
    const data: any[] = [];
    for (let start = 0; ; start += 500) {
      const page = await factory().range(start, start + 499);
      if (page.error) return { data: [], error: page.error };
      data.push(...(page.data ?? []));
      if ((page.data ?? []).length < 500) return { data, error: null };
    }
  }
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
    const [meta, balances, movements, prices] = await Promise.all([
      admin.from("company_inventory_meta").select("version").eq("id", true).maybeSingle(),
      allRows(() => admin
        .from("company_inventory")
        .select("product_id,quantity,tracked,updated_at,source")
        .order("product_id")),
      allRows(() => admin
        .from("inventory_movements")
        .select("id,product_id,movement_date,quantity,reason,reference_id")
        .or(`owner_id.eq.${owner},owner_id.is.null`)
        .order("movement_date").order("id")),
      allRows(() => admin
        .from("product_prices")
        .select("product_id,cost,quote_price,pack,effective_date,created_at")
        .lte("effective_date", businessDate())
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false }).order("product_id").order("id")),
    ]);
    const inventoryUnavailable = [meta.error, balances.error, movements.error].some(
      (error) => error && ["PGRST205", "42P01"].includes(error.code),
    );
    if (prices.error) throw new DomainError("STORAGE", "Không tải đủ bảng giá hiện hành", 503);
    if (!prices.error) {
      const effective = new Map<string, (typeof prices.data)[number]>();
      for (const price of prices.data ?? [])
        if (!effective.has(price.product_id)) effective.set(price.product_id, price);
      directory.products = directory.products.map((product) => {
        const price = effective.get(product.id);
        return price
          ? {
              ...product,
              cost: price.cost == null ? null : String(price.cost),
              price: price.quote_price == null ? null : String(price.quote_price),
              pack: Number(price.pack),
              effectiveDate: price.effective_date,
            }
          : product;
      });
    }
    const combined = attachDirectory(data.state, directory, common.data.version);
    if (!inventoryUnavailable) {
      if (meta.error || balances.error || movements.error)
        throw new DomainError("STORAGE", "Chưa tải được kho công ty", 503);
      combined.inventoryVersion = Number(meta.data?.version ?? 1);
      combined.inventory = (balances.data ?? []).map((row) => ({
        productId: row.product_id,
        quantity: Number(row.quantity),
        tracked: !!row.tracked,
        updatedAt: row.updated_at,
        source: row.source,
      }));
      combined.inventoryMovements = (movements.data ?? []).map((row) => ({
        id: row.id,
        productId: row.product_id,
        date: row.movement_date,
        quantity: Number(row.quantity),
        reason: row.reason,
        referenceId: row.reference_id,
      }));
    }
    return refresh(combined);
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
    actor?: Actor,
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
    const inventoryChanged =
      !current ||
      JSON.stringify(current.inventory) !== JSON.stringify(next.inventory) ||
      JSON.stringify(current.inventoryMovements) !==
        JSON.stringify(next.inventoryMovements);
    if (next.inventoryVersion !== undefined) {
      assert(
        command.inventoryVersion === next.inventoryVersion,
        "Kho công ty đã thay đổi. Vui lòng tải lại.",
        "CONFLICT",
      );
      const committed = await admin.rpc(command.type === "clearInventory" ? "commit_inventory_clear" : "commit_workspace_v2", {
        ...(command.type === "clearInventory" ? { p_product: command.payload.productId } : {}),
        p_owner: owner,
        p_expected: command.version,
        p_key: command.idempotencyKey,
        p_fingerprint: fingerprint(command),
        p_state: next,
        p_shared_expected: next.sharedVersion,
        p_directory: commonChanged ? directoryOf(next) : null,
        p_inventory_expected: next.inventoryVersion,
        p_inventory: inventoryChanged ? next.inventory : null,
        p_inventory_movements: inventoryChanged
          ? next.inventoryMovements
          : null,
        p_actor: actor?.id ?? owner,
        p_reason: String(command.payload?.reason ?? "Cập nhật dữ liệu"),
      });
      if (committed.error)
        throw new DomainError(
          committed.error.message.includes("CONFLICT")
            ? "CONFLICT"
            : "STORAGE",
          committed.error.message.includes("CONFLICT")
            ? committed.error.message.includes("RESERVED") ? "Kho còn hàng đang giữ cho toa hoặc chương trình của nhân viên" : "Dữ liệu, danh mục hoặc kho đã thay đổi. Vui lòng tải lại."
            : "Chưa lưu được thao tác",
          committed.error.message.includes("CONFLICT") ? 409 : 503,
        );
      return stateOf(owner);
    }
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
    if (current.inventoryVersion !== undefined)
      assert(
        command.inventoryVersion === current.inventoryVersion,
        "Kho công ty đã thay đổi. Vui lòng tải lại.",
        "CONFLICT",
      );
    const next = execute(current, command, { ...verified, workspaceOwnerId: owner } as Actor);
    return commitForOwner(owner, command, next, current, verified);
  }
  return {
    async getStatesForOwners(owners: string[]) {
      if (!owners.length) return [];
      const first = await stateOf(owners[0]);
      const common = directoryOf(first);
      const [states, movements] = await Promise.all([
        allRows(() => admin.from("employee_states").select("owner_id,state").order("owner_id")),
        allRows(() => admin.from("inventory_movements").select("id,owner_id,product_id,movement_date,quantity,reason,reference_id").order("id")),
      ]);
      if (states.error || movements.error) throw new DomainError("STORAGE", "Không tải đủ dữ liệu tổng hợp", 503);
      const byOwner = new Map(states.data.map(row => [row.owner_id, row.state]));
      return owners.map(owner => {
        const state = attachDirectory(byOwner.get(owner) ?? emptyState(), common, first.sharedVersion ?? 0);
        state.inventoryVersion = first.inventoryVersion;
        state.inventory = structuredClone(first.inventory);
        state.inventoryMovements = movements.data.filter(row => row.owner_id === owner || row.owner_id === null).map(row => ({ id: row.id, productId: row.product_id, date: row.movement_date, quantity: Number(row.quantity), reason: row.reason, referenceId: row.reference_id }));
        return refresh(state);
      });
    },
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
