import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Express, Request, Response } from "express";
import { DomainError } from "./domain.js";
import { validateEmployeePassword } from "./accounts.js";

const INVALID = "Liên kết khôi phục không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu liên kết mới và mở bằng trình duyệt đã gửi yêu cầu.";
const TTL = 15 * 60 * 1000;
const verifierCookie = "tc_recovery_verifier";
const proofCookie = "tc_recovery_proof";
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
type Provider = Pick<SupabaseClient["auth"], "resetPasswordForEmail" | "exchangeCodeForSession">;
export interface RecoveryDependencies {
  secret: string;
  origin: string;
  createProvider(storage: Storage): Provider;
  resolveEmail(login: string): Promise<string | null>;
  saveProof(hash: string, userId: string, expiresAt: string): Promise<void>;
  consumeProof(hash: string, userId: string): Promise<boolean>;
  revokeSessions(userId: string, recoveryAccessToken: string): Promise<void>;
  updatePassword(userId: string, password: string): Promise<void>;
  now?: () => number;
}

/** Only this server can issue a recovery cookie. A login bearer or URL type is never proof. */
export function createPasswordRecovery(deps: RecoveryDependencies) {
  if (deps.secret.length < 32) throw new Error("Recovery cookie secret must contain at least 32 characters");
  const key = createHash("sha256").update(`truecare-password-recovery:${deps.secret}`).digest();
  const now = deps.now ?? Date.now;
  const seal = (kind: string, payload: object) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(kind));
    // A fixed encrypted plaintext size prevents the verifier cookie from revealing
    // whether the submitted login resolved to an account.
    const body = { ...payload, expires: now() + TTL, padding: "" };
    const serialized = JSON.stringify(body);
    if (serialized.length > 4096) throw new DomainError("RECOVERY_INVALID", INVALID, 401);
    body.padding = "x".repeat(4096 - serialized.length);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  };
  const unseal = (kind: string, value: string): any => {
    try {
      if (!value || value.length > 6000) throw new Error();
      const raw = Buffer.from(value, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(kind));
      decipher.setAuthTag(raw.subarray(12, 28));
      const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString());
      if (!Number.isFinite(payload.expires) || payload.expires <= now()) throw new Error();
      return payload;
    } catch { throw new DomainError("RECOVERY_INVALID", INVALID, 401); }
  };
  const storageFor = (values: Record<string, string>): Storage => ({
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = value; },
    removeItem: (key) => { delete values[key]; },
  });
  return {
    async start(login: string) {
      if (!login.trim() || login.length > 254) throw new DomainError("VALIDATION", "Nhập email hoặc tên đăng nhập hợp lệ", 400);
      const email = await deps.resolveEmail(login.trim());
      const values: Record<string, string> = {};
      if (email) {
        // Keep the configured Site URL callback. The frontend moves a root
        // callback containing `code` to the public reset screen before render.
        const result = await deps.createProvider(storageFor(values)).resetPasswordForEmail(email, { redirectTo: deps.origin.replace(/\/$/, "") });
        if (result.error) throw new DomainError("STORAGE", "Không gửi được hướng dẫn khôi phục lúc này", 503);
      }
      // Same response and encrypted cookie even when no account matches.
      return seal("verifier", { values });
    },
    async exchange(code: string, cookie: string, flowId?: string) {
      const { values } = unseal("verifier", cookie);
      if (typeof code !== "string" || !code || code.length > 2048 || !values || typeof values !== "object")
        throw new DomainError("RECOVERY_INVALID", INVALID, 401);
      const result = await deps.createProvider(storageFor(values)).exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (result.error || !result.data.session || (result.data as typeof result.data & { redirectType?: string }).redirectType !== "recovery")
        throw new DomainError("RECOVERY_INVALID", INVALID, 401);
      const token = randomBytes(32).toString("base64url");
      const userId = result.data.session.user.id;
      await deps.saveProof(createHash("sha256").update(token).digest("hex"), userId, new Date(now() + TTL).toISOString());
      return seal("proof", { token, userId, accessToken: result.data.session.access_token });
    },
    async reset(cookie: string, password: unknown, confirmation: unknown) {
      const validPassword = validateEmployeePassword(password);
      if (validPassword !== confirmation) throw new DomainError("VALIDATION", "Mật khẩu xác nhận không khớp", 400);
      const proof = unseal("proof", cookie);
      if (typeof proof.token !== "string" || typeof proof.userId !== "string" || typeof proof.accessToken !== "string")
        throw new DomainError("RECOVERY_INVALID", INVALID, 401);
      // Database CAS wins once across processes and concurrent requests. Fail closed on any subsequent failure.
      if (!await deps.consumeProof(createHash("sha256").update(proof.token).digest("hex"), proof.userId))
        throw new DomainError("RECOVERY_INVALID", INVALID, 401);
      // Revoke first: a provider failure can require a new recovery email, but cannot leave an old app session usable.
      await deps.revokeSessions(proof.userId, proof.accessToken);
      await deps.updatePassword(proof.userId, validPassword);
    },
  };
}

export function registerPasswordRecovery(app: Express, options: {
  url: string; anonKey: string; admin: SupabaseClient; secret: string; origin: string;
  resolveEmail(login: string): Promise<string | null>;
  revokeSessions(userId: string): Promise<unknown>;
  rateLimit(req: Request, action: string): Promise<void>;
}) {
  const failStorage = () => new DomainError("STORAGE", "Không thể hoàn tất khôi phục. Hãy yêu cầu liên kết mới.", 503);
  const recovery = createPasswordRecovery({
    secret: options.secret, origin: options.origin, resolveEmail: options.resolveEmail,
    createProvider: (storage) => createClient(options.url, options.anonKey, { auth: {
      flowType: "pkce", storageKey: "tc-password-recovery", storage,
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    } }).auth,
    async saveProof(token_hash, user_id, expires_at) {
      const { error } = await options.admin.from("app_password_recovery_proofs").insert({ token_hash, user_id, expires_at });
      if (error) throw failStorage();
    },
    async consumeProof(p_token_hash, p_user_id) {
      const { data, error } = await options.admin.rpc("consume_password_recovery_proof", { p_token_hash, p_user_id });
      if (error) throw failStorage();
      return data === true;
    },
    async revokeSessions(userId, token) {
      await options.revokeSessions(userId);
      const { error } = await options.admin.auth.admin.signOut(token, "global");
      if (error) throw failStorage();
    },
    async updatePassword(userId, password) {
      const { error } = await options.admin.auth.admin.updateUserById(userId, { password });
      if (error) throw failStorage();
    },
  });
  const cookieOptions = { httpOnly: true, secure: new URL(options.origin).protocol === "https:", sameSite: "lax" as const, path: "/api/auth", maxAge: TTL };
  const readCookie = (req: Request, name: string) => req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  const handler = (action: string, run: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: (error?: unknown) => void) => {
    try {
      res.set("Cache-Control", "no-store");
      // Require browser-origin proof even if registered before generic API middleware.
      if (req.get("origin") !== new URL(options.origin).origin) throw new DomainError("FORBIDDEN", "Nguồn yêu cầu không hợp lệ", 403);
      await options.rateLimit(req, action);
      await run(req, res);
    } catch (error) { next(error); }
  };
  app.post("/api/auth/forgot-password", handler("recovery-start", async (req, res) => {
    res.cookie(verifierCookie, await recovery.start(String(req.body.email ?? "")), cookieOptions);
    res.clearCookie(proofCookie, { path: cookieOptions.path });
    res.json({ message: "Nếu email hợp lệ, hướng dẫn đã được gửi. Mở liên kết bằng trình duyệt đang sử dụng trong vòng 15 phút." });
  }));
  app.post("/api/auth/recovery/exchange", handler("recovery-exchange", async (req, res) => {
    const proof = await recovery.exchange(req.body.code, readCookie(req, verifierCookie), req.body.flowId);
    res.cookie(proofCookie, proof, cookieOptions);
    res.clearCookie(verifierCookie, { path: cookieOptions.path });
    res.json({ ok: true });
  }));
  app.post("/api/auth/recovery/reset", handler("recovery-reset", async (req, res) => {
    await recovery.reset(readCookie(req, proofCookie), req.body.password, req.body.confirmPassword);
    res.clearCookie(proofCookie, { path: cookieOptions.path });
    res.clearCookie(verifierCookie, { path: cookieOptions.path });
    res.clearCookie("tc_session", { path: "/" });
    res.clearCookie("tc_session_id", { path: "/" });
    res.json({ message: "Đã đổi mật khẩu và đăng xuất các phiên cũ. Vui lòng đăng nhập lại." });
  }));
}
