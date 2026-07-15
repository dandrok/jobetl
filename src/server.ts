import { createServer, IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { config } from "@core/config";
import { PostgresJobRepository } from "@storage/postgres-job-repository";

// In-memory session store (Active sessions map to expiry timestamp)
const activeSessions = new Map<string, number>();
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory rate limiting map: IP -> array of timestamps of attempts
const loginAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_LOGIN_ATTEMPTS = 5;

// Periodically clean up expired entries from maps (unref to not block process termination)
const gcInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, expiry] of activeSessions.entries()) {
      if (now > expiry) {
        activeSessions.delete(sessionId);
      }
    }
    for (const [ip, attempts] of loginAttempts.entries()) {
      const validAttempts = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (validAttempts.length === 0) {
        loginAttempts.delete(ip);
      } else {
        loginAttempts.set(ip, validAttempts);
      }
    }
  },
  60 * 60 * 1000
);
gcInterval.unref();

// Helper to parse cookies from request headers
function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;

  if (rc) {
    rc.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURI(parts.join("="));
      }
    });
  }
  return list;
}

// Helper to validate session
function isAuthenticated(req: IncomingMessage): boolean {
  const cookies = parseCookies(req);
  const sessionId = cookies.session_id;
  if (!sessionId) return false;

  const expiry = activeSessions.get(sessionId);
  if (!expiry) return false;

  if (Date.now() > expiry) {
    activeSessions.delete(sessionId);
    return false;
  }
  return true;
}

export function startServer() {
  const repository = new PostgresJobRepository(config.databaseUrl);

  const server = createServer((req, res) => {
    // Add CORS headers to support cookie-based sessions from local Vite dev server (port 3000)
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route: POST /api/login
    if (req.url === "/api/login" && req.method === "POST") {
      let body = "";
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        body += chunk.toString();
        if (body.length > 65536) {
          tooLarge = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload Too Large" }));
          req.destroy();
        }
      });
      req.on("end", () => {
        if (tooLarge) return;
        (async () => {
          try {
            let data: { password?: string };
            try {
              data = JSON.parse(body) as { password?: string };
            } catch {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Bad Request: Invalid JSON" }));
              return;
            }

            const hash = process.env.DASHBOARD_PASSWORD_HASH;
            if (!hash || !data.password) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Missing password or server configuration" }));
              return;
            }

            // Per-source rate limiting using client IP address
            const ip = (
              (req.headers["x-forwarded-for"] as string) ||
              req.socket.remoteAddress ||
              "unknown"
            )
              .split(",")[0]
              .trim();
            const now = Date.now();
            const attempts = loginAttempts.get(ip) || [];
            const recentAttempts = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
            if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
              res.writeHead(429, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ error: "Too many login attempts. Please try again later." })
              );
              return;
            }
            recentAttempts.push(now);
            loginAttempts.set(ip, recentAttempts);

            const isValid = await argon2.verify(hash, data.password);
            if (isValid) {
              const sessionId = randomBytes(24).toString("hex");
              activeSessions.set(sessionId, Date.now() + SESSION_EXPIRY_MS);

              const isProd = process.env.NODE_ENV === "production";
              const cookieValue = `session_id=${sessionId}; HttpOnly; Path=/; Max-Age=${SESSION_EXPIRY_MS / 1000}; SameSite=Strict${
                isProd ? "; Secure" : ""
              }`;

              res.writeHead(200, {
                "Set-Cookie": cookieValue,
                "Content-Type": "application/json"
              });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid password" }));
            }
          } catch (e: unknown) {
            console.error("Login failed:", e);
            res.writeHead(500);
            res.end("Internal Server Error");
          }
        })();
      });
      return;
    }

    // Route: POST /api/logout
    if (req.url === "/api/logout" && req.method === "POST") {
      const cookies = parseCookies(req);
      const sessionId = cookies.session_id;
      if (sessionId) {
        activeSessions.delete(sessionId);
      }
      res.writeHead(200, {
        "Set-Cookie": "session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict",
        "Content-Type": "application/json"
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Authentication Guard on all job resources
    if (!isAuthenticated(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (req.url === "/api/jobs" && req.method === "GET") {
      (async () => {
        try {
          const jobs = await repository.listJobs();
          const filtered = jobs.filter((j) => j.status === "matched" || j.status === "rejected");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(filtered));
        } catch (e: unknown) {
          console.error("Failed to list jobs:", e);
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      })();
    } else if (req.url?.startsWith("/api/jobs/") && req.method === "PATCH") {
      const match = req.url.match(/^\/api\/jobs\/([^/]+)$/);
      if (match) {
        let id: string;
        try {
          id = decodeURIComponent(match[1]);
        } catch {
          res.writeHead(400);
          res.end("Bad Request");
          return;
        }

        let body = "";
        let tooLarge = false;
        req.on("data", (chunk) => {
          if (tooLarge) return;
          body += chunk.toString();
          if (body.length > 65536) {
            tooLarge = true;
            res.writeHead(413);
            res.end("Payload Too Large");
            req.destroy();
          }
        });
        req.on("end", () => {
          if (tooLarge) return;
          (async () => {
            interface StatusPatchPayload {
              isApplied?: boolean;
              isNotInterested?: boolean;
            }
            let data: StatusPatchPayload;
            try {
              data = JSON.parse(body) as StatusPatchPayload;
            } catch {
              res.writeHead(400);
              res.end("Bad Request: Invalid JSON");
              return;
            }

            try {
              let updated = false;
              let handled = false;

              if (typeof data.isApplied === "boolean") {
                const resApplied = await repository.updateJobAppliedStatus(id, data.isApplied);
                updated = updated || resApplied;
                handled = true;
              }
              if (typeof data.isNotInterested === "boolean") {
                const resInterested = await repository.updateJobInterestedStatus(
                  id,
                  data.isNotInterested
                );
                updated = updated || resInterested;
                handled = true;
              }

              if (handled) {
                if (updated) {
                  res.writeHead(200, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ success: true }));
                } else {
                  res.writeHead(404);
                  res.end("Not found");
                }
              } else {
                res.writeHead(400);
                res.end("Bad Request");
              }
            } catch (e: unknown) {
              console.error("Failed to update job status in DB:", e);
              res.writeHead(500);
              res.end("Internal Server Error");
            }
          })();
        });
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.on("error", (e) => {
    console.error("Server error:", e);
    process.exit(1);
  });

  server.listen(3001, () => {
    console.log("✨ JobETL Backend API is running at http://localhost:3001");
  });

  const shutdown = () => {
    console.log("\n🛑 Shutting down HTTP server gracefully...");
    server.close(async (err) => {
      let hasError = !!err;
      if (err) {
        console.error("Error shutting down server:", err);
      }
      try {
        await repository.close();
        console.log("🔌 Database connections closed successfully.");
      } catch (dbErr) {
        console.error("Error closing database connections:", dbErr);
        hasError = true;
      }
      process.exit(hasError ? 1 : 0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
