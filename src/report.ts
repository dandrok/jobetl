import { config } from "./config.js";
import { SQLiteJobRepository } from "./storage/sqlite-job-repository.js";

function main(): void {
  const repository = new SQLiteJobRepository(config.databasePath);
  const jobs = repository.listMatchedJobs(10);

  if (jobs.length === 0) {
    console.log("No matched jobs stored yet.");
    return;
  }

  for (const job of jobs) {
    console.log(
      [
        `${job.matchScore?.toFixed(2) ?? "0.00"} | ${job.title} | ${job.company}`,
        `status=${job.status}`,
        job.salaryText ? `salary=${job.salaryText}` : undefined,
        job.url
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
}

main();
