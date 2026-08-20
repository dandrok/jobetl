import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIp, parseCookies, readJsonBody, sendJson } from "@server/http";
import { SESSION_COOKIE } from "@server/sessions";
import type { AppDeps } from "@server/app";

interface LoginPayload {
  password?: unknown;
}

export async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AppDeps
): Promise<void> {
  const body = await readJsonBody<LoginPayload>(req, res);
  if (!body.ok) return;

  const { password } = body.value;
  if (typeof password !== "string" || password.length === 0) {
    sendJson(res, 400, { error: "Missing password" });
    return;
  }

  const ip = clientIp(req, deps.env.trustProxy);
  if (deps.rateLimiter.isLimited(ip)) {
    sendJson(res, 429, { error: "Too many login attempts. Please try again later." });
    return;
  }

  const outcome = await deps.passwordVerifier.verify(deps.env.passwordHash, password);

  if (outcome === "busy") {
    sendJson(res, 503, { error: "Server busy. Please try again shortly." }, { "Retry-After": "5" });
    return;
  }

  if (outcome === "invalid") {
    deps.rateLimiter.recordFailure(ip);
    sendJson(res, 401, {
      error: "Invalid password",
      remainingAttempts: deps.rateLimiter.remaining(ip)
    });
    return;
  }

  // Successful logins must not consume the attempt budget, or routine use
  // locks the owner out.
  deps.rateLimiter.reset(ip);
  const sessionId = deps.sessions.create();
  sendJson(
    res,
    200,
    { success: true },
    { "Set-Cookie": deps.sessions.cookie(sessionId, deps.env.isProduction) }
  );
}

export function handleLogout(req: IncomingMessage, res: ServerResponse, deps: AppDeps): void {
  deps.sessions.destroy(parseCookies(req)[SESSION_COOKIE]);
  sendJson(
    res,
    200,
    { success: true },
    { "Set-Cookie": deps.sessions.clearedCookie(deps.env.isProduction) }
  );
}
