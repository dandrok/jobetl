import { describe, expect, test } from "vitest";

import { buildProfileRunConfig, listEnabledProfileIds, resolveProfilesToRun } from "@core/profiles";
import type { ProfileConfig, RunConfig, SourceConfigMap } from "@core/types";

function createSources(keyword: string): SourceConfigMap {
  return {
    justjoinit: {
      enabled: true,
      baseUrl: "https://justjoin.it",
      maxListings: 10,
      filters: { keyword }
    },
    nofluffjobs: {
      enabled: true,
      baseUrl: "https://nofluffjobs.com",
      maxListings: 10,
      filters: { keyword }
    },
    bulldogjob: {
      enabled: false,
      baseUrl: "https://bulldogjob.com",
      maxListings: 10,
      filters: { keyword }
    },
    pracujpl: {
      enabled: false,
      baseUrl: "https://it.pracuj.pl",
      maxListings: 10,
      filters: { keyword }
    },
    thesmartjobs: {
      enabled: false,
      baseUrl: "https://thesmartjobs.com",
      maxListings: 10,
      filters: { category: "it", sort: "freshness" }
    }
  };
}

function createProfile(
  partial: Partial<ProfileConfig> & Pick<ProfileConfig, "sources">
): ProfileConfig {
  return {
    enabled: true,
    resumeMarkdownPath: "./cv.md",
    matchThreshold: 0.78,
    emailSubjectPrefix: "JobETL [test]",
    ...partial
  };
}

function createConfig(profiles: RunConfig["profiles"]): RunConfig {
  return {
    databaseUrl: "postgres://localhost:5432/test",
    fetchConcurrency: 1,
    scoreConcurrency: 1,
    profiles
  };
}

describe("profiles", () => {
  test("lists enabled profile ids", () => {
    const config = createConfig({
      software: createProfile({ sources: createSources("javascript") }),
      ai: createProfile({ enabled: false, sources: createSources("llm") })
    });

    expect(listEnabledProfileIds(config)).toEqual(["software"]);
  });

  test("buildProfileRunConfig flattens shared settings and profile fields", () => {
    const config = createConfig({
      software: createProfile({
        resumeMarkdownPath: "./cv.md",
        matchThreshold: 0.8,
        emailSubjectPrefix: "JobETL [software]",
        sources: createSources("javascript")
      })
    });

    expect(buildProfileRunConfig(config, "software")).toEqual({
      profileId: "software",
      databaseUrl: "postgres://localhost:5432/test",
      fetchConcurrency: 1,
      scoreConcurrency: 1,
      resumeMarkdownPath: "./cv.md",
      matchThreshold: 0.8,
      emailSubjectPrefix: "JobETL [software]",
      sources: createSources("javascript")
    });
  });

  test("buildProfileRunConfig throws for unknown profile", () => {
    const config = createConfig({
      software: createProfile({ sources: createSources("javascript") })
    });

    expect(() => buildProfileRunConfig(config, "ai")).toThrow('Unknown profile "ai"');
  });

  test("buildProfileRunConfig throws for disabled profile", () => {
    const config = createConfig({
      ai: createProfile({ enabled: false, sources: createSources("llm") })
    });

    expect(() => buildProfileRunConfig(config, "ai")).toThrow('Profile "ai" is disabled');
  });

  test("resolveProfilesToRun returns all enabled when no profile is requested", () => {
    const config = createConfig({
      software: createProfile({ sources: createSources("javascript") }),
      ai: createProfile({ sources: createSources("llm") })
    });

    expect(resolveProfilesToRun(config)).toEqual(["software", "ai"]);
  });

  test("resolveProfilesToRun returns a single explicit profile", () => {
    const config = createConfig({
      software: createProfile({ sources: createSources("javascript") }),
      ai: createProfile({ sources: createSources("llm") })
    });

    expect(resolveProfilesToRun(config, "ai")).toEqual(["ai"]);
  });

  test("resolveProfilesToRun throws when no profiles are enabled", () => {
    const config = createConfig({
      software: createProfile({ enabled: false, sources: createSources("javascript") })
    });

    expect(() => resolveProfilesToRun(config)).toThrow("No enabled profiles in config");
  });

  test("resolveProfilesToRun throws when explicit profile is disabled", () => {
    const config = createConfig({
      ai: createProfile({ enabled: false, sources: createSources("llm") })
    });

    expect(() => resolveProfilesToRun(config, "ai")).toThrow('Profile "ai" is disabled in config');
  });
});
