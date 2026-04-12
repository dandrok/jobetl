import type { RunConfig } from "./types.js";

export const config: RunConfig = {
  databasePath: "./data/jobetl.db",
  resumeMarkdownPath: "./cv.md",
  matchThreshold: 0.78,
  sources: {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 5, // TODO: we put 5 here only for testing
      filters: {
        keyword: "node.js",
        categorySlug: "javascript",
        workingMode: "remote",
        withSalaryOnly: false
      }
    }
  }
};
