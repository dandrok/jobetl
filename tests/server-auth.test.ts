import { describe, expect, it, beforeAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as argon2 from "argon2";
import type { ServerEnv } from "@core/types";
import type { StoredJob } from "@storage/index";
import { createApp, type AppDeps, type DashboardRepository } from "@server/app";
import { SessionStore } from "@server/sessions";
import { RateLimiter } from "@server/rate-limit";
import { ARGON2_OPTIONS, PasswordVerifier } from "@server/auth/password";

const PASSWORD = "correct-horse-battery-staple";

const JOBS = [
  { externalId: "job-1", status: "matched" },
  { externalId: "job-2", status: "rejected" },
  { externalId: "job-3", status: "pending" }
] as unknown as StoredJob[];

function fakeRepository(overrides: Partial<DashboardRepository> = {}): DashboardRepository {
  return {
    listJobs: async () => JOBS,
    updateJobAppliedStatus: async (id) => id === "job-1",
    updateJobInterestedStatus: async (id) => id === "job-1",
    ...overrides
  };
}

function serverEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    passwordHash: "unused-by-the-fake-verifier",
    port: 0,
    host: "127.0.0.1",
    isProduction: false,
    trustProxy: false,
    corsAllowedOrigin: "http://localhost:3000",
    ...overrides
  };
}

interface Harness {
  deps: AppDeps;
  clock: { now: number };
}

function buildDeps(overrides: Partial<AppDeps> = {}): Harness {
  const clock = { now: 1_700_000_000_000 };
  const tick = () => clock.now;

  const deps: AppDeps = {
    env: serverEnv(),
    repository: fakeRepository(),
    sessions: new SessionStore({ clock: tick }),
    rateLimiter: new RateLimiter({ clock: tick }),
    // A fake verifier keeps the suite fast; real Argon2 is covered separately.
    passwordVerifier: new PasswordVerifier({
      verifyFn: async (_hash, password) => password === PASSWORD
    }),
    ...overrides
  };

  return { deps, clock };
}

async function withServer(deps: AppDeps, fn: (base: string) => Promise<void>): Promise<void> {
  const server = createServer(createApp(deps));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

function login(base: string, password: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ password })
  });
}

/** Extracts just the `session_id=...` pair for use as a request Cookie header. */
function cookieFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0];
}

describe("login", () => {
  it("sets a hardened session cookie on the correct password", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await login(base, PASSWORD);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("session_id=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");
      // Secure would break plain-HTTP local dev, so it is production-only.
      expect(setCookie).not.toContain("Secure");
    });
  });

  it("marks the cookie Secure in production", async () => {
    const { deps } = buildDeps({ env: serverEnv({ isProduction: true }) });
    await withServer(deps, async (base) => {
      expect(cookieFrom(await login(base, PASSWORD))).toBeTruthy();
      const res = await login(base, PASSWORD);
      expect(res.headers.get("set-cookie")).toContain("Secure");
    });
  });

  it("rejects a wrong password with 401 and issues no cookie", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await login(base, "wrong-password");
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });

  it("rejects a non-string password without consulting the verifier", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: { toString: "nope" } })
      });
      expect(res.status).toBe(400);
    });
  });

  it("rejects malformed JSON with 400", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json"
      });
      expect(res.status).toBe(400);
    });
  });
});

describe("auth guard", () => {
  it("rejects /api/jobs without a session", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/api/jobs`);
      expect(res.status).toBe(401);
    });
  });

  it("serves matched and rejected jobs with a valid session", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/jobs`, { headers: { cookie } });

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const body = (await res.json()) as StoredJob[];
      expect(body.map((job) => job.externalId)).toEqual(["job-1", "job-2"]);
    });
  });

  it("answers 401 rather than 404 for unknown paths when unauthenticated", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      // Deny-by-default: an unauthenticated caller learns nothing about routing.
      const res = await fetch(`${base}/api/secret-admin-thing`);
      expect(res.status).toBe(401);
    });
  });

  it("answers 404 for unknown paths once authenticated", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/nope`, { headers: { cookie } });
      expect(res.status).toBe(404);
    });
  });

  it("rejects a forged session id", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/api/jobs`, { headers: { cookie: "session_id=deadbeef" } });
      expect(res.status).toBe(401);
    });
  });
});

describe("session lifetime", () => {
  it("expires the session after 24 hours", async () => {
    const { deps, clock } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      expect((await fetch(`${base}/api/jobs`, { headers: { cookie } })).status).toBe(200);

      clock.now += 24 * 60 * 60 * 1000 + 1;
      expect((await fetch(`${base}/api/jobs`, { headers: { cookie } })).status).toBe(401);
    });
  });

  it("invalidates the cookie on logout", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));

      const logout = await fetch(`${base}/api/logout`, { method: "POST", headers: { cookie } });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

      expect((await fetch(`${base}/api/jobs`, { headers: { cookie } })).status).toBe(401);
    });
  });

  it("drops expired sessions during gc", () => {
    const clock = { now: 0 };
    const sessions = new SessionStore({ clock: () => clock.now, expiryMs: 1000 });
    sessions.create();
    expect(sessions.size).toBe(1);

    clock.now = 2000;
    sessions.gc();
    expect(sessions.size).toBe(0);
  });
});

describe("login rate limiting", () => {
  it("returns 429 after five failed attempts", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      for (let i = 0; i < 5; i += 1) {
        expect((await login(base, "wrong")).status).toBe(401);
      }
      const blocked = await login(base, "wrong");
      expect(blocked.status).toBe(429);

      // Still blocked even with the right password: the limit is per-IP.
      expect((await login(base, PASSWORD)).status).toBe(429);
    });
  });

  it("does not spend attempt budget on successful logins", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      // Regression guard: the original code recorded the attempt before
      // verifying, so routine logins locked the owner out.
      for (let i = 0; i < 8; i += 1) {
        expect((await login(base, PASSWORD)).status).toBe(200);
      }
    });
  });

  it("clears accumulated failures after a success", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      for (let i = 0; i < 4; i += 1) await login(base, "wrong");
      expect((await login(base, PASSWORD)).status).toBe(200);

      for (let i = 0; i < 5; i += 1) {
        expect((await login(base, "wrong")).status).toBe(401);
      }
    });
  });

  it("lets the window slide", async () => {
    const { deps, clock } = buildDeps();
    await withServer(deps, async (base) => {
      for (let i = 0; i < 5; i += 1) await login(base, "wrong");
      expect((await login(base, "wrong")).status).toBe(429);

      clock.now += 60 * 60 * 1000 + 1;
      expect((await login(base, "wrong")).status).toBe(401);
    });
  });

  it("reports remaining attempts", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await login(base, "wrong");
      expect(await res.json()).toMatchObject({ remainingAttempts: 4 });
    });
  });
});

describe("client IP resolution", () => {
  it("ignores x-forwarded-for when TRUST_PROXY is off", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      // A spoofed header must not mint a fresh bucket per request.
      for (let i = 0; i < 5; i += 1) {
        await login(base, "wrong", { "x-forwarded-for": `10.0.0.${i}` });
      }
      const res = await login(base, "wrong", { "x-forwarded-for": "10.0.0.99" });
      expect(res.status).toBe(429);
    });
  });

  it("separates buckets by x-real-ip when TRUST_PROXY is on", async () => {
    const { deps } = buildDeps({ env: serverEnv({ trustProxy: true }) });
    await withServer(deps, async (base) => {
      for (let i = 0; i < 5; i += 1) {
        await login(base, "wrong", { "x-real-ip": "203.0.113.1" });
      }
      expect((await login(base, "wrong", { "x-real-ip": "203.0.113.1" })).status).toBe(429);
      expect((await login(base, "wrong", { "x-real-ip": "203.0.113.2" })).status).toBe(401);
    });
  });

  it("takes the rightmost x-forwarded-for hop, which the proxy appends", async () => {
    const { deps } = buildDeps({ env: serverEnv({ trustProxy: true }) });
    await withServer(deps, async (base) => {
      // The client controls the left of the chain; only the last hop is trustworthy.
      for (let i = 0; i < 5; i += 1) {
        await login(base, "wrong", { "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` });
      }
      const res = await login(base, "wrong", { "x-forwarded-for": "10.9.9.9, 203.0.113.7" });
      expect(res.status).toBe(429);
    });
  });
});

describe("payload limits", () => {
  it("rejects an oversized login body with 413", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await login(base, "x".repeat(70_000));
      expect(res.status).toBe(413);
    });
  });

  it("counts the cap in bytes, not characters", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      // 30k three-byte characters is ~90KB encoded but only 30k JS chars, so a
      // length-based cap would wave it through.
      const res = await login(base, "世".repeat(30_000));
      expect(res.status).toBe(413);
    });
  });
});

describe("job updates", () => {
  it("marks a job applied", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/jobs/job-1`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: true })
      });
      expect(res.status).toBe(200);
    });
  });

  it("404s for an unknown job id", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/jobs/missing`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: true })
      });
      expect(res.status).toBe(404);
    });
  });

  it("400s when no recognised field is supplied", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/jobs/job-1`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: "yes" })
      });
      expect(res.status).toBe(400);
    });
  });

  it("rejects a malformed field rather than silently ignoring it", async () => {
    let interestedCalls = 0;
    const { deps } = buildDeps({
      repository: fakeRepository({
        updateJobInterestedStatus: async () => {
          interestedCalls += 1;
          return true;
        }
      })
    });

    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      // A valid isApplied alongside a bogus isNotInterested must not report
      // success for a half-applied update.
      const res = await fetch(`${base}/api/jobs/job-1`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: true, isNotInterested: "yes" })
      });
      expect(res.status).toBe(400);
      expect(interestedCalls).toBe(0);
    });
  });

  it("accepts both fields when both are boolean", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const cookie = cookieFrom(await login(base, PASSWORD));
      const res = await fetch(`${base}/api/jobs/job-1`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: true, isNotInterested: false })
      });
      expect(res.status).toBe(200);
    });
  });

  it("requires a session", async () => {
    const { deps } = buildDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/api/jobs/job-1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApplied: true })
      });
      expect(res.status).toBe(401);
    });
  });
});

describe("PasswordVerifier", () => {
  it("never runs more verifications concurrently than its limit", async () => {
    let active = 0;
    let peak = 0;

    const verifier = new PasswordVerifier({
      maxConcurrent: 2,
      maxQueued: 100,
      verifyFn: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return false;
      }
    });

    await Promise.all(Array.from({ length: 20 }, () => verifier.verify("hash", "pw")));

    // Guards the queue bound, not memory: peak Argon2 memory is set by
    // UV_THREADPOOL_SIZE x memoryCost, not by this limit.
    expect(peak).toBe(2);
  });

  it("sheds load instead of queueing without bound", async () => {
    const verifier = new PasswordVerifier({
      maxConcurrent: 1,
      maxQueued: 2,
      verifyFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return false;
      }
    });

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => verifier.verify("hash", "pw"))
    );
    expect(outcomes).toContain("busy");
  });

  it("returns 503 when the verifier is saturated", async () => {
    const { deps } = buildDeps({
      passwordVerifier: new PasswordVerifier({
        maxConcurrent: 1,
        maxQueued: 1,
        verifyFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return false;
        }
      })
    });

    await withServer(deps, async (base) => {
      const responses = await Promise.all(Array.from({ length: 8 }, () => login(base, "wrong")));
      expect(responses.some((res) => res.status === 503)).toBe(true);
    });
  });
});

describe("argon2 wiring", () => {
  let hash: string;

  beforeAll(async () => {
    // Hash once: Argon2 is deliberately slow, and per-test hashing would dominate runtime.
    hash = await argon2.hash(PASSWORD, { ...ARGON2_OPTIONS, memoryCost: 1024, timeCost: 1 });
  }, 30_000);

  it("verifies a real Argon2 digest end to end", async () => {
    const { deps } = buildDeps({
      env: serverEnv({ passwordHash: hash }),
      passwordVerifier: new PasswordVerifier()
    });

    await withServer(deps, async (base) => {
      expect((await login(base, PASSWORD)).status).toBe(200);
      expect((await login(base, "not-the-password")).status).toBe(401);
    });
  });

  it("uses OWASP-minimum parameters, well under the 64 MiB library default", () => {
    expect(ARGON2_OPTIONS.memoryCost).toBe(19456);
    expect(ARGON2_OPTIONS.timeCost).toBe(2);
    expect(ARGON2_OPTIONS.parallelism).toBe(1);
  });
});
