import { expect, type APIRequestContext } from "@playwright/test";

/** Only local test server supports this secret-gated endpoint; never use against production. */
export async function seedOwnWorkspace(request: APIRequestContext, commands: { type: string; payload: unknown }[], role?: "admin" | "employee") {
  const session = await (await request.get("/api/auth/session")).json();
  expect(session.user?.id).toBeTruthy();
  const result = await request.post("/api/test/seed", {
    headers: { "x-test-secret": "truecare-local-e2e-only" },
    data: { ownerId: session.user.id, commands, ...(role ? { role } : {}) },
  });
  expect(result.ok(), await result.text()).toBeTruthy();
  return (await (await request.get("/api/state")).json());
}
