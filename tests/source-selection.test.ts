import { describe, expect, test } from "vitest";

import { selectSources } from "@scrapers/select";
import type { SourceAdapterMap } from "@scrapers/types";
import type { RunConfig } from "@core/types";

function createConfig(): RunConfig {
  return {
    databasePath: "./data/test.db",
    resumeMarkdownPath: "./cv.example.md",
    matchThreshold: 0.78,
    fetchConcurrency: 1,
    scoreConcurrency: 1,
    sources: {
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
    }
  };
}

describe("selectSources", () => {
  test("returns all enabled sources when no source filter is provided", () => {
    const selected = selectSources(createConfig(), createAdapters());

    expect(selected.map((item) => item.source)).toEqual([
      "justjoinit",
      "nofluffjobs",
      "bulldogjob",
      "pracujpl"
    ]);
  });

  test("returns only the requested enabled source when a filter is provided", () => {
    const selected = selectSources(createConfig(), createAdapters(), "nofluffjobs");

    expect(selected.map((item) => item.source)).toEqual(["nofluffjobs"]);
  });

  test("throws when the requested source is disabled in config", () => {
    const config = createConfig();
    config.sources.nofluffjobs.enabled = false;

    expect(() => selectSources(config, createAdapters(), "nofluffjobs")).toThrow(
      'Source "nofluffjobs" is disabled in config'
    );
  });
});
