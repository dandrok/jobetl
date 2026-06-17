import { createServer } from "node:http";
import { config } from "@core/config";
import { SQLiteJobRepository } from "@storage/sqlite-job-repository";

export function startServer() {
  const repository = new SQLiteJobRepository(config.databasePath);

  const server = createServer((req, res) => {
    // Add basic CORS headers for local development if Vite is running on a different port
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/api/jobs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const jobs = repository
        .listJobs()
        .filter((j) => j.status === "matched" || j.status === "rejected");
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
              res.writeHead(400);
              res.end("Bad Request");
            }
          } catch {
            res.writeHead(400);
            res.end("Bad Request");
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

  server.listen(3001, () => {
    console.log("✨ JobETL Backend API is running at http://localhost:3001");
  });
}
