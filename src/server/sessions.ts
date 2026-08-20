import { randomBytes } from "node:crypto";
import type { Clock } from "@server/http";

export const SESSION_COOKIE = "session_id";
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface SessionStoreOptions {
  expiryMs?: number;
  clock?: Clock;
}

/**
 * In-memory session store: session id -> absolute expiry timestamp.
 *
 * Instance-scoped rather than module-scoped so tests can construct a fresh one
 * per case, and so swapping in a Postgres-backed store later touches only this
 * file. Sessions do not survive a restart, which is an accepted trade-off for a
 * single-user dashboard.
 */
export class SessionStore {
  private readonly sessions = new Map<string, number>();
  private readonly expiryMs: number;
  private readonly now: Clock;

  constructor({ expiryMs = SESSION_EXPIRY_MS, clock = Date.now }: SessionStoreOptions = {}) {
    this.expiryMs = expiryMs;
    this.now = clock;
  }

  create(): string {
    const id = randomBytes(24).toString("hex");
    this.sessions.set(id, this.now() + this.expiryMs);
    return id;
  }

  isValid(id: string | undefined): boolean {
    if (!id) return false;

    const expiry = this.sessions.get(id);
    if (expiry === undefined) return false;

    if (this.now() > expiry) {
      this.sessions.delete(id);
      return false;
    }
    return true;
  }

  destroy(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  /** Drops expired entries so the map cannot grow without bound. */
  gc(): void {
    const now = this.now();
    for (const [id, expiry] of this.sessions) {
      if (now > expiry) this.sessions.delete(id);
    }
  }

  get size(): number {
    return this.sessions.size;
  }

  cookie(id: string, isProduction: boolean): string {
    // Max-Age is delta-seconds and must be an integer. Round up so a
    // sub-second lifetime never becomes Max-Age=0 (expire immediately).
    return this.buildCookie(id, Math.ceil(this.expiryMs / 1000), isProduction);
  }

  clearedCookie(isProduction: boolean): string {
    return this.buildCookie("", 0, isProduction);
  }

  private buildCookie(value: string, maxAgeSeconds: number, isProduction: boolean): string {
    const attrs = [
      `${SESSION_COOKIE}=${value}`,
      "HttpOnly",
      "Path=/",
      `Max-Age=${maxAgeSeconds}`,
      "SameSite=Strict"
    ];
    // Secure would make the cookie unusable over plain-HTTP local development.
    if (isProduction) attrs.push("Secure");
    return attrs.join("; ");
  }
}
