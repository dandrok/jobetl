import { describe, expect, test } from "vitest";

import {
  formatOfferProgressText,
  formatRunStartText
} from "../src/progress/formatters.js";

describe("progress formatters", () => {
  test("formats the run start text with listing counts", () => {
    expect(formatRunStartText(25)).toBe("Found 25 listings to process");
  });

  test("formats per-offer progress text", () => {
    expect(formatOfferProgressText(3, 25, "Fetching markdown", "Acme")).toBe(
      "[3/25] Fetching markdown: Acme"
    );
  });
});
