import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { SQLiteJobRepository } from "./storage/sqlite-job-repository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function startViewer() {
  const repository = new SQLiteJobRepository(config.databasePath);

  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      const html = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
      res.end(html);
    } else if (req.url === "/api/jobs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const jobs = repository.listJobs().filter(j => j.status === "matched" || j.status === "rejected");
      res.end(JSON.stringify(jobs));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(3000, () => {
    console.log("✨ JobETL Dashboard is running at http://localhost:3000");
  });
}

startViewer();
