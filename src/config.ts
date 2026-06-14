import type { RunConfig } from "./types.js";

export const config: RunConfig = {
  databasePath: "./data/jobetl.db",
  resumeMarkdownPath: "./cv.md",
  matchThreshold: 0.78,
  fetchConcurrency: 10,
  scoreConcurrency: 10,
  sources: {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 200,
      filters: {
        keyword: "javascript",
        withSalaryOnly: false
      }
    },
    nofluffjobs: {
      enabled: true,
      baseUrl: "https://nofluffjobs.com",
      maxListings: 200,
      filters: {
        keyword: "javascript"
      }
    },
    bulldogjob: {
      enabled: true,
      baseUrl: "https://bulldogjob.com",
      maxListings: 200,
      filters: {
        keyword: "JavaScript"
      }
    }
  }
};
