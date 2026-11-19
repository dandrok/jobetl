import "dotenv/config";
import type { RunConfig, SourceConfigMap } from "@core/types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

// Search terms are title/skill driven on most boards, so one broad term is not
// enough. Each source splits its maxListings budget across these terms.
const softwareKeywords = ["javascript", "typescript", "react", "node.js", "frontend", "fullstack"];
// Bulldogjob's skill slugs are case-sensitive and expect display casing.
const softwareBulldogjobKeywords = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Frontend",
  "Fullstack"
];
const aiKeywords = ["llm", "ai", "genai", "machine learning"];
const aiBulldogjobKeywords = ["LLM", "AI", "GenAI"];

const softwareSources: SourceConfigMap = {
  justjoinit: {
    enabled: true,
    baseUrl: "https://justjoin.it",
    maxListings: 200,
    filters: {
      keywords: softwareKeywords,
      withSalaryOnly: false
    }
  },
  nofluffjobs: {
    enabled: true,
    baseUrl: "https://nofluffjobs.com",
    maxListings: 200,
    filters: {
      keywords: softwareKeywords
    }
  },
  bulldogjob: {
    enabled: true,
    baseUrl: "https://bulldogjob.com",
    maxListings: 200,
    filters: {
      keywords: softwareBulldogjobKeywords
    }
  },
  pracujpl: {
    enabled: true,
    baseUrl: "https://it.pracuj.pl",
    maxListings: 200,
    filters: {
      keywords: softwareKeywords
    }
  },
  thesmartjobs: {
    enabled: true,
    baseUrl: "https://thesmartjobs.com",
    maxListings: 200,
    filters: {
      category: "it-03989325",
      sort: "freshness"
    }
  }
};

const aiSources: SourceConfigMap = {
  justjoinit: {
    enabled: true,
    baseUrl: "https://justjoin.it",
    maxListings: 200,
    filters: {
      keywords: aiKeywords,
      withSalaryOnly: false
    }
  },
  nofluffjobs: {
    enabled: true,
    baseUrl: "https://nofluffjobs.com",
    maxListings: 200,
    filters: {
      keywords: aiKeywords
    }
  },
  bulldogjob: {
    enabled: true,
    baseUrl: "https://bulldogjob.com",
    maxListings: 200,
    filters: {
      keywords: aiBulldogjobKeywords
    }
  },
  pracujpl: {
    enabled: true,
    baseUrl: "https://it.pracuj.pl",
    maxListings: 200,
    filters: {
      keywords: aiKeywords
    }
  },
  thesmartjobs: {
    // No reliable AI category slug yet — leave disabled for this profile
    enabled: false,
    baseUrl: "https://thesmartjobs.com",
    maxListings: 200,
    filters: {
      category: "it-03989325",
      sort: "freshness"
    }
  }
};

export const config: RunConfig = {
  databaseUrl: process.env.DATABASE_URL,
  fetchConcurrency: 10,
  scoreConcurrency: 10,
  profiles: {
    software: {
      enabled: true,
      resumeMarkdownPath: "./cv.md",
      matchThreshold: 0.78,
      emailSubjectPrefix: "JobETL [software]",
      sources: softwareSources
    },
    ai: {
      enabled: true,
      resumeMarkdownPath: "./cv-ai.md",
      matchThreshold: 0.75,
      emailSubjectPrefix: "JobETL [ai]",
      sources: aiSources
    }
  }
};
