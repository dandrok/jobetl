import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerEnv } from "@core/types";
import type { JobRepository } from "@storage/index";
import { parseCookies, sendJson } from "@server/http";
import { SESSION_COOKIE, SessionStore } from "@server/sessions";
import { RateLimiter } from "@server/rate-limit";
import { PasswordVerifier } from "@server/auth/password";
import { handleLogin, handleLogout } from "@server/routes/auth";
import { handleListJobs, handlePatchJob } from "@server/routes/jobs";

/** Only the repository methods the dashboard actually needs, so tests can fake it cheaply. */
export type DashboardRepository = Pick<
  JobRepository,
  "listJobs" | "updateJobAppliedStatus" | "updateJobInterestedStatus"
>;

export interface AppDeps {
  env: ServerEnv;
  repository: DashboardRepository;
  sessions: SessionStore;
  rateLimiter: RateLimiter;
  passwordVerifier: PasswordVerifier;
}

const JOB_PATCH_PATTERN = /^\/api\/jobs\/([^/]+)$/;

/**
 * Builds the request handler from explicit dependencies.
 *
 * Nothing here binds a port, opens a database connection or reads process.env,
 * which is what makes the auth behaviour testable in-process.
 */
export function createApp(deps: AppDeps) {
  return function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    void route(req, res, deps).catch((error) => {
      console.error("Unhandled request error:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal Server Error" });
      } else {
        res.end();
      }
    });
  };
}

async function route(req: IncomingMessage, res: ServerResponse, deps: AppDeps): Promise<void> {
  // Cross-origin only matters for the Vite dev server; production is same-origin
  // behind nginx and gets no CORS headers at all.
  if (!deps.env.isProduction) {
    res.setHeader("Access-Control-Allow-Origin", deps.env.corsAllowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
  }

  const path = (req.url ?? "").split("?")[0];

  if (path === "/api/login" && req.method === "POST") {
    await handleLogin(req, res, deps);
    return;
  }

  if (path === "/api/logout" && req.method === "POST") {
    handleLogout(req, res, deps);
    return;
  }

  // Deny-by-default: the guard runs before dispatch, so unknown paths answer 401
  // rather than 404 and reveal nothing about which routes exist.
  if (!deps.sessions.isValid(parseCookies(req)[SESSION_COOKIE])) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (path === "/api/jobs" && req.method === "GET") {
    await handleListJobs(res, deps);
    return;
  }

  const patchMatch = req.method === "PATCH" ? JOB_PATCH_PATTERN.exec(path) : null;
  if (patchMatch) {
    await handlePatchJob(req, res, patchMatch[1], deps);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}
