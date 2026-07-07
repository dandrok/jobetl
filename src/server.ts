import { createServer } from "node:http";
import { config } from "@core/config";
import { PostgresJobRepository } from "@storage/postgres-job-repository";

export function startServer() {
  const repository = new PostgresJobRepository(config.databaseUrl);

  const server = createServer((req, res) => {
    // Add basic CORS headers for local development if Vite is running on a different port
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
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
