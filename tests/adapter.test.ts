import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { JustJoinItAdapter } from "../src/sources/justjoinit.js";

describe("JustJoinItAdapter", () => {
  test("extracts offer urls and listing metadata from html", () => {
    const html = readFileSync("tests/fixtures/justjoinit-listing.html", "utf8");
    const adapter = new JustJoinItAdapter();

    const offers = adapter.parseListings(html);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme-senior-node-engineer-warszawa-nodejs",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme-senior-node-engineer-warszawa-nodejs",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Warszawa"
    });
    expect(offers[1]?.salaryText).toBeUndefined();
  });
});
