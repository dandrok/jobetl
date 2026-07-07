import "dotenv/config";
import type { RunConfig } from "@core/types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

export const config: RunConfig = {
  databaseUrl: process.env.DATABASE_URL,
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
    },
    pracujpl: {
      enabled: true,
      baseUrl: "https://it.pracuj.pl",
      maxListings: 200,
      filters: {
        keyword: "javascript"
      }
    }
  }
};
