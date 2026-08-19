import "dotenv/config";
import { PostgresJobRepository } from "../storage/postgres-job-repository";
import { config } from "../core/config";

async function checkStats() {
  const repo = new PostgresJobRepository(config.databaseUrl);
  try {
    const allJobs = await repo.listJobs();
    console.log(`Total jobs in DB: ${allJobs.length}`);

    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const profileCounts: Record<string, number> = {};
    const dateCounts: Record<string, number> = {};

    for (const job of allJobs) {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1;
      const prof = job.profile || "none";
      profileCounts[prof] = (profileCounts[prof] || 0) + 1;

      const dateStr = (job.createdAt || "").slice(0, 10);
      if (dateStr) {
        dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
      }
    }

    console.log("\n--- STATUS COUNTS ---");
    console.table(statusCounts);

    console.log("\n--- SOURCE COUNTS ---");
    console.table(sourceCounts);

    console.log("\n--- PROFILE COUNTS ---");
    console.table(profileCounts);

    console.log("\n--- CREATED AT DATES (Newest first) ---");
    const sortedDates = Object.entries(dateCounts).sort((a, b) => b[0].localeCompare(a[0]));
    console.table(sortedDates.slice(0, 15));

    const matchedJobs = allJobs.filter((j) => j.status === "matched");
    console.log(`\n--- RECENT MATCHED JOBS (Total: ${matchedJobs.length}) ---`);
    const recentMatches = matchedJobs
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 10);
    for (const j of recentMatches) {
      console.log(
        `[${j.createdAt?.slice(0, 10)}] [${j.source}] (${j.matchScore?.toFixed(2)}) ${j.title} @ ${j.company}`
      );
    }

    const rejectedJobs = allJobs.filter((j) => j.status === "rejected");
    console.log(`\n--- RECENT REJECTED JOBS (Total: ${rejectedJobs.length}) ---`);
    const recentRejections = rejectedJobs
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);
    for (const j of recentRejections) {
      console.log(
        `[${j.createdAt?.slice(0, 10)}] [${j.source}] (${j.matchScore?.toFixed(2)}) ${j.title} - Reason: ${j.matchReason?.slice(0, 120)}`
      );
    }

    const errorJobs = allJobs.filter((j) => j.status === "error");
    console.log(`\n--- ERROR JOBS (Total: ${errorJobs.length}) ---`);
    for (const j of errorJobs.slice(0, 5)) {
      console.log(
        `[${j.createdAt?.slice(0, 10)}] [${j.source}] ${j.title} @ ${j.company} - Error: ${j.matchReason}`
      );
    }
  } finally {
    await repo.close();
  }
}

checkStats().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
