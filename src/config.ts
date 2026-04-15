import type { RunConfig } from "./types.js";

export const config: RunConfig = {
  databasePath: "./data/jobetl.db",
  resumeMarkdownPath: "./cv.example.md",
  matchThreshold: 0.78,
  fetchConcurrency: 2,
  scoreConcurrency: 2,
  sources: {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 200,
      filters: {
        keyword: "javascript",
        categorySlug: "javascript",
        location: "warszawa",
        withSalaryOnly: false
      }
    },
    nofluffjobs: {
      enabled: true,
      baseUrl: "https://nofluffjobs.com",
      maxListings: 200,
      filters: {
        keyword: "javascript",
        location: "warszawa"
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
