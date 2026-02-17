import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loginWithPin, registerAccount } from "../src/lib/authApi";

describe("authApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("login ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            customToken: "token",
            profile: { id: "u1", name: "Fer", avatar: "🎾", isAdmin: false, usernameNormalized: "fer" }
          }),
          { status: 200 }
        )
      )
    );

    const result = await loginWithPin("u1", "1234");
    expect(result.customToken).toBe("token");
    expect(result.profile.id).toBe("u1");
  });

  it("login fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "PIN incorrecto." }), { status: 401 }))
    );

    await expect(loginWithPin("u1", "0000")).rejects.toThrow("PIN incorrecto.");
  });

  it("create redirects to login when username exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "Ese nombre ya existe.",
            profile: { id: "u1", name: "Fer", avatar: "🎾", isAdmin: false, usernameNormalized: "fer" }
          }),
          { status: 409 }
        )
      )
    );

    const result = await registerAccount("Fer", "1234");
    expect(result.status).toBe("exists");
  });
});
