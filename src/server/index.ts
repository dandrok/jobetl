import { createServer } from "node:http";
import { config } from "@core/config";
import { loadServerEnv } from "@core/env";
import { PostgresJobRepository } from "@storage/postgres-job-repository";
import { createApp } from "@server/app";
import { SessionStore } from "@server/sessions";
import { RateLimiter } from "@server/rate-limit";
import {
  describeExpectedParams,
  describeHashParams,
  needsRehash,
  PasswordVerifier
} from "@server/auth/password";

const GC_INTERVAL_MS = 60 * 60 * 1000;
const SHUTDOWN_DRAIN_MS = 10_000;

export function startServer() {
  // Throws on missing DASHBOARD_PASSWORD_HASH, so a misconfigured server fails
  // loudly at boot instead of serving a login page nobody can get through.
  const env = loadServerEnv();

  if (needsRehash(env.passwordHash)) {
    // Deliberately a warning, not a hard failure: needsRehash also fires for
    // parameters *stronger* than expected, and refusing to boot would take the
    // dashboard down rather than degrade it.
    console.warn(
      "⚠️  DASHBOARD_PASSWORD_HASH parameters differ from this build's defaults.\n" +
        `    stored:   ${describeHashParams(env.passwordHash)}\n` +
        `    expected: ${describeExpectedParams()}\n` +
        "    Regenerate with `npm run hash:password` unless this is intentional. " +
        "A higher m multiplies per-login memory use (peak = UV_THREADPOOL_SIZE x m)."
    );
  }

  const repository = new PostgresJobRepository(config.databaseUrl);
  const sessions = new SessionStore();
  const rateLimiter = new RateLimiter();

  const server = createServer(
    createApp({
      env,
      repository,
      sessions,
      rateLimiter,
      passwordVerifier: new PasswordVerifier()
    })
  );

  const gcInterval = setInterval(() => {
    sessions.gc();
    rateLimiter.gc();
  }, GC_INTERVAL_MS);
  gcInterval.unref();

  server.on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });

  server.listen(env.port, env.host, () => {
    console.log(`✨ JobETL Backend API is running at http://${env.host}:${env.port}`);
  });

  let shuttingDown = false;

  const shutdown = () => {
    // PM2 reload can deliver a second signal; without this the first close is
    // still in flight and the second immediately errors.
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("\n🛑 Shutting down HTTP server gracefully...");
    clearInterval(gcInterval);

    // server.close() waits for keep-alive connections to go idle, which can
    // outlast PM2's kill timeout and turn a reload into a SIGKILL.
    const drainTimer = setTimeout(() => {
      console.warn(`Connections still open after ${SHUTDOWN_DRAIN_MS}ms; closing them.`);
      server.closeAllConnections();
    }, SHUTDOWN_DRAIN_MS);

    let finished = false;

    const finish = async (err?: Error | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(drainTimer);

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
    };

    server.close((err) => void finish(err));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
