import type { RunConfig } from "./types.js";

export const config: RunConfig = {
  databasePath: "./data/jobetl.db",
  resumeMarkdownPath: "./cv.md",
  matchThreshold: 0.78,
  sources: {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 25,
      filters: {
        keyword: "node.js",
        categorySlug: "javascript",
        workingMode: "remote",
        withSalaryOnly: false
      }
    }
  }
};
