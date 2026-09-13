import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordRecovery, type RecoveryDependencies } from "../server/password-recovery.js";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

function fixture() {
  let now = Date.parse("2026-09-13T04:00:00Z");
  let redirectType = "recovery";
  const calls: string[] = [];
  const proofs = new Map<string, { userId: string; expires: number; consumed: boolean }>();
  const deps: RecoveryDependencies = {
    secret: "test-only-recovery-cookie-secret-123456789",
    origin: "https://example.test",
    now: () => now,
    resolveEmail: async login => login === "member" ? "member@example.test" : null,
    createProvider: storage => ({
      resetPasswordForEmail: async (_email: string, options: { redirectTo?: string }) => {
        assert.equal(options.redirectTo, "https://example.test");
        storage.setItem("tc-password-recovery-code-verifier", "server-created-verifier/recovery");
        return { data: {}, error: null };
      },
      exchangeCodeForSession: async (code: string) => {
        assert.equal(storage.getItem("tc-password-recovery-code-verifier"), "server-created-verifier/recovery");
        if (code !== "email-recovery-code") return { data: { session: null, user: null }, error: new Error("invalid") };
        return { data: { session: { user: { id: "member-id" }, access_token: "recovery-access-token" }, redirectType }, error: null };
      },
    }) as unknown as ReturnType<RecoveryDependencies["createProvider"]>,
    saveProof: async (hash, userId, expiresAt) => { proofs.set(hash, { userId, expires: Date.parse(expiresAt), consumed: false }); },
    consumeProof: async (hash, userId) => {
      const proof = proofs.get(hash);
      if (!proof || proof.consumed || proof.userId !== userId || proof.expires <= now) return false;
      proof.consumed = true;
      return true;
    },
    revokeSessions: async (userId, token) => {
      assert.equal(userId, "member-id"); assert.equal(token, "recovery-access-token"); calls.push("revoke");
    },
    updatePassword: async (userId, password) => { assert.equal(userId, "member-id"); assert.equal(password, "new-password-123"); calls.push("update"); },
  };
  return { recovery: createPasswordRecovery(deps), deps, calls, proofs, advance: (ms: number) => { now += ms; }, normalLogin: () => { redirectType = "signin"; } };
}

test("recovery requires server-bound verifier and never accepts normal login proof", async () => {
  const f = fixture();
  await assert.rejects(f.recovery.exchange("email-recovery-code", "normal-login-bearer"), /Liên kết/);
  const cookie = await f.recovery.start("member");
  assert.equal(cookie.includes("server-created-verifier"), false);
  f.normalLogin();
  await assert.rejects(f.recovery.exchange("email-recovery-code", cookie), /Liên kết/);
  assert.equal(f.proofs.size, 0);
});

test("recovery response does not expose account existence through cookie length", async () => {
  const f = fixture();
  const known = await f.recovery.start("member");
  const unknown = await f.recovery.start("unknown");
  assert.equal(known.length, unknown.length);
  assert.ok(known.length < 6000);
});

test("recovery validates confirmation before consuming proof and revokes all sessions before password update", async () => {
  const f = fixture();
  const cookie = await f.recovery.start("member");
  const proof = await f.recovery.exchange("email-recovery-code", cookie);
  assert.equal(proof.includes("recovery-access-token"), false);
  await assert.rejects(f.recovery.reset(proof, "new-password-123", "different"), /khớp/);
  assert.deepEqual(f.calls, []);
  await f.recovery.reset(proof, "new-password-123", "new-password-123");
  assert.deepEqual(f.calls, ["revoke", "update"]);
  await assert.rejects(f.recovery.reset(proof, "new-password-123", "new-password-123"), /Liên kết/);
});

test("two concurrent recovery submissions consume proof exactly once", async () => {
  const f = fixture();
  const proof = await f.recovery.exchange("email-recovery-code", await f.recovery.start("member"));
  const results = await Promise.allSettled([f.recovery.reset(proof, "new-password-123", "new-password-123"), f.recovery.reset(proof, "new-password-123", "new-password-123")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.calls.filter(c => c === "update").length, 1);
});

test("tampered, swapped and expired cookies cannot recover an account", async () => {
  const f = fixture();
  const verifier = await f.recovery.start("member");
  const proof = await f.recovery.exchange("email-recovery-code", verifier);
  await assert.rejects(f.recovery.reset(verifier, "new-password-123", "new-password-123"), /Liên kết/);
  await assert.rejects(f.recovery.exchange("email-recovery-code", proof), /Liên kết/);
  const raw = Buffer.from(proof, "base64url"); raw[35] ^= 1;
  await assert.rejects(f.recovery.reset(raw.toString("base64url"), "new-password-123", "new-password-123"), /Liên kết/);
  f.advance(15 * 60 * 1000);
  await assert.rejects(f.recovery.reset(proof, "new-password-123", "new-password-123"), /Liên kết/);
  assert.deepEqual(f.calls, []);
});

test("revocation failure fails closed without changing password or reusing proof", async () => {
  const f = fixture();
  f.deps.revokeSessions = async () => { throw new Error("unavailable"); };
  const recovery = createPasswordRecovery(f.deps);
  const proof = await recovery.exchange("email-recovery-code", await recovery.start("member"));
  await assert.rejects(recovery.reset(proof, "new-password-123", "new-password-123"), /unavailable/);
  await assert.rejects(recovery.reset(proof, "new-password-123", "new-password-123"), /Liên kết/);
  assert.deepEqual(f.calls, []);
});

test("installed Supabase SDK carries recovery PKCE verifier through encrypted server cookie", async () => {
  const f = fixture();
  let challenge = "";
  f.deps.createProvider = storage => createClient("https://supabase.test", "test-anon-key", {
    auth: { flowType: "pkce", storageKey: "tc-password-recovery", storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.includes("/recover")) {
        challenge = body.code_challenge;
        assert.equal(body.code_challenge_method, "s256");
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      assert.match(url, /grant_type=pkce/);
      assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), challenge);
      return new Response(JSON.stringify({ access_token: "recovery-access-token", token_type: "bearer", expires_in: 3600, refresh_token: "unused", user: { id: "member-id" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  }).auth;
  const recovery = createPasswordRecovery(f.deps);
  const proof = await recovery.exchange("provider-code", await recovery.start("member"));
  await recovery.reset(proof, "new-password-123", "new-password-123");
  assert.deepEqual(f.calls, ["revoke", "update"]);
});
