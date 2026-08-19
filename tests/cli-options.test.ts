import { describe, expect, test } from "vitest";

import { parseCliOptions } from "@core/cli-options";

const KNOWN_PROFILES = ["software", "ai"] as const;

describe("parseCliOptions", () => {
  test("returns an empty options object when no arguments are provided", () => {
    expect(parseCliOptions([])).toEqual({});
  });

  test("parses a supported --source value", () => {
    expect(parseCliOptions(["--source", "nofluffjobs"])).toEqual({
      source: "nofluffjobs"
    });
  });

  test("parses bulldogjob as a supported --source value", () => {
    expect(parseCliOptions(["--source", "bulldogjob"])).toEqual({
      source: "bulldogjob"
    });
  });

  test("parses a supported --profile value when known profiles are provided", () => {
    expect(parseCliOptions(["--profile", "ai"], KNOWN_PROFILES)).toEqual({
      profile: "ai"
    });
  });

  test("parses --profile and --source together", () => {
    expect(
      parseCliOptions(["--profile", "software", "--source", "justjoinit"], KNOWN_PROFILES)
    ).toEqual({
      profile: "software",
      source: "justjoinit"
    });
  });

  test("throws when --source is missing its value", () => {
    expect(() => parseCliOptions(["--source"])).toThrow("Missing value for --source");
  });

  test("throws when --profile is missing its value", () => {
    expect(() => parseCliOptions(["--profile"], KNOWN_PROFILES)).toThrow(
      "Missing value for --profile"
    );
  });

  test("throws when --source receives an unsupported source name", () => {
    expect(() => parseCliOptions(["--source", "unknown-source"])).toThrow(
      'Unsupported source "unknown-source". Expected one of: justjoinit, nofluffjobs'
    );
  });

  test("throws when --profile receives an unknown profile name", () => {
    expect(() => parseCliOptions(["--profile", "data-science"], KNOWN_PROFILES)).toThrow(
      'Unknown profile "data-science". Expected one of: software, ai'
    );
  });

  test("throws on unknown arguments", () => {
    expect(() => parseCliOptions(["--wat"])).toThrow("Unknown argument: --wat");
  });
});
