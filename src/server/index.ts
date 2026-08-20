import { createServer } from "node:http";
import { config } from "@core/config";
import { loadServerEnv } from "@core/env";
import { PostgresJobRepository } from "@storage/postgres-job-repository";
import { createApp } from "@server/app";
import { SessionStore } from "@server/sessions";
import { RateLimiter } from "@server/rate-limit";
import { needsRehash, PasswordVerifier } from "@server/auth/password";

const GC_INTERVAL_MS = 60 * 60 * 1000;

export function startServer() {
  // Throws on missing DASHBOARD_PASSWORD_HASH, so a misconfigured server fails
  // loudly at boot instead of serving a login page nobody can get through.
  const env = loadServerEnv();

  if (needsRehash(env.passwordHash)) {
    console.warn(
      "⚠️  DASHBOARD_PASSWORD_HASH uses non-standard Argon2 parameters. " +
        "Regenerate it with `npm run hash:password` to reduce per-login memory use."
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

  const shutdown = () => {
    console.log("\n🛑 Shutting down HTTP server gracefully...");
    clearInterval(gcInterval);
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
