import { describe, expect, test } from "vitest";

import { selectSources } from "@scrapers/select";
import type { SourceAdapterMap } from "@scrapers/types";
import type { SourceConfigMap } from "@core/types";

function createSources(): SourceConfigMap {
  return {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 10,
      filters: {
        keyword: "javascript",
        categorySlug: "javascript",
        location: "warszawa"
      }
    },
    nofluffjobs: {
      enabled: true,
      baseUrl: "https://nofluffjobs.com",
      maxListings: 10,
      filters: {
        keyword: "javascript",
        location: "warszawa"
      }
    },
    bulldogjob: {
      enabled: true,
      baseUrl: "https://bulldogjob.com",
      maxListings: 10,
      filters: {
        keyword: "JavaScript"
      }
    },
    pracujpl: {
      enabled: true,
      baseUrl: "https://it.pracuj.pl",
      maxListings: 10,
      filters: {
        keyword: "javascript"
      }
    },
    thesmartjobs: {
      enabled: true,
      baseUrl: "https://thesmartjobs.com",
      maxListings: 10,
      filters: {
        category: "it-03989325",
        sort: "freshness"
      }
    }
  };
}

function createAdapters(): SourceAdapterMap {
  return {
    justjoinit: {
      source: "justjoinit",
      discoverListings: async () => []
    },
    nofluffjobs: {
      source: "nofluffjobs",
      discoverListings: async () => []
    },
    bulldogjob: {
      source: "bulldogjob",
      discoverListings: async () => []
    },
    pracujpl: {
      source: "pracujpl",
      discoverListings: async () => []
    },
    thesmartjobs: {
      source: "thesmartjobs",
      discoverListings: async () => []
    }
  };
}

describe("selectSources", () => {
  test("returns all enabled sources when no source filter is provided", () => {
    const selected = selectSources(createSources(), createAdapters());

    expect(selected.map((item) => item.source)).toEqual([
      "justjoinit",
      "nofluffjobs",
      "bulldogjob",
      "pracujpl",
      "thesmartjobs"
    ]);
  });

  test("returns only the requested enabled source when a filter is provided", () => {
    const selected = selectSources(createSources(), createAdapters(), "nofluffjobs");

    expect(selected.map((item) => item.source)).toEqual(["nofluffjobs"]);
  });

  test("throws when the requested source is disabled in config", () => {
    const sources = createSources();
    sources.nofluffjobs.enabled = false;

    expect(() => selectSources(sources, createAdapters(), "nofluffjobs")).toThrow(
      'Source "nofluffjobs" is disabled in config'
    );
  });

  test("accepts a ProfileRunConfig and uses its sources map", () => {
    const selected = selectSources(
      {
        profileId: "software",
        databaseUrl: "postgres://localhost:5432/test",
        resumeMarkdownPath: "./cv.md",
        matchThreshold: 0.78,
        fetchConcurrency: 1,
        scoreConcurrency: 1,
        emailSubjectPrefix: "JobETL [software]",
        sources: createSources()
      },
      createAdapters(),
      "justjoinit"
    );

    expect(selected.map((item) => item.source)).toEqual(["justjoinit"]);
  });
});
