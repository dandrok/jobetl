import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { SQLiteJobRepository } from "./storage/sqlite-job-repository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let DASHBOARD_HTML = "";
try {
  const rawHtml = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
  DASHBOARD_HTML = rawHtml.replace(/__MATCH_THRESHOLD__/g, String(Math.round(config.matchThreshold * 100)));
} catch (e) {
  console.error("Failed to load dashboard.html:", e);
  process.exit(1);
}

function startViewer() {
  const repository = new SQLiteJobRepository(config.databasePath);

  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(DASHBOARD_HTML);
    } else if (req.url === "/api/jobs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const jobs = repository.listJobs().filter(j => j.status === "matched" || j.status === "rejected");
      res.end(JSON.stringify(jobs));
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
        req.on("data", chunk => {
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
          try {
            const data = JSON.parse(body);
            if (typeof data.isApplied === "boolean") {
              const updated = repository.updateJobAppliedStatus(id, data.isApplied);
              if (updated) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
              } else {
                res.writeHead(404);
                res.end("Not found");
              }
            } else {
              res.writeHead(400); res.end("Bad Request");
            }
          } catch {
            res.writeHead(400); res.end("Bad Request");
          }
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

  server.listen(3000, () => {
    console.log("✨ JobETL Dashboard is running at http://localhost:3000");
  });
}

startViewer();
