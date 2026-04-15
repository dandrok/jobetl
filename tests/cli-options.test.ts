import { describe, expect, test } from "vitest";

import { parseCliOptions } from "../src/cli-options.js";

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

  test("throws when --source is missing its value", () => {
    expect(() => parseCliOptions(["--source"])).toThrow(
      "Missing value for --source"
    );
  });

  test("throws when --source receives an unsupported source name", () => {
    expect(() => parseCliOptions(["--source", "unknown-source"])).toThrow(
      'Unsupported source "unknown-source". Expected one of: justjoinit, nofluffjobs'
    );
  });

  test("throws on unknown arguments", () => {
    expect(() => parseCliOptions(["--wat"])).toThrow("Unknown argument: --wat");
  });
});
