import "dotenv/config";
import type { RunConfig, SourceConfigMap } from "@core/types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const softwareSources: SourceConfigMap = {
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
      keyword: "llm",
      withSalaryOnly: false
    }
  },
  nofluffjobs: {
    enabled: true,
    baseUrl: "https://nofluffjobs.com",
    maxListings: 200,
    filters: {
      keyword: "llm"
    }
  },
  bulldogjob: {
    enabled: true,
    baseUrl: "https://bulldogjob.com",
    maxListings: 200,
    filters: {
      keyword: "GenAI"
    }
  },
  pracujpl: {
    enabled: true,
    baseUrl: "https://it.pracuj.pl",
    maxListings: 200,
    filters: {
      keyword: "llm"
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
