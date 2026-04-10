import type { RunConfig } from "./types.js";

export const config: RunConfig = {
  notionDatabaseId: "replace-me",
  resumeMarkdownPath: "./cv.md",
  matchThreshold: 0.78,
  dryRun: true,
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
