import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { JustJoinItAdapter } from "../src/sources/justjoinit.js";
import { NoFluffJobsAdapter } from "../src/sources/nofluffjobs.js";

describe("JustJoinItAdapter", () => {
  test("limits discovery to the configured maxListings", async () => {
    const html = readFileSync("tests/fixtures/justjoinit-listing.html", "utf8");
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async () => html);

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 1,
        filters: {
          keyword: "javascript",
          categorySlug: "javascript",
          location: "warszawa"
        }
      },
      fetchHtml
    );

    expect(fetchHtml).toHaveBeenCalledWith(
      "https://justjoin.it/job-offers/all-locations?keyword=javascript&category=javascript&location=warszawa"
    );
    expect(offers).toHaveLength(1);
  });

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

  test("extracts clean fields from nested listing cards without copying whole card text", () => {
    const html = `
      <main>
        <a href="/job-offer/accenture-node-js-developer-warszawa-javascript">
          <div>
            <div><span>Super offer</span></div>
            <div><h3>Node.js Developer</h3></div>
            <div><span>Undisclosed Salary</span></div>
            <div><span>Undisclosed Salary</span></div>
            <div><span>Accenture</span></div>
            <div><span>Warszawa, +3Locations</span></div>
            <div><span>22d left</span></div>
            <div>
              <span>AWS</span>
              <span>TypeScript</span>
              <span>Node.js</span>
            </div>
            <div>
              <span>AWS</span>
              <span>TypeScript</span>
              <span>Node.js</span>
            </div>
          </div>
        </a>
        <a href="/job-offer/antal-sp-z-o-o--qa-automation-engineer-wroclaw-testing">
          <div>
            <div><h3>QA Automation Engineer</h3></div>
            <div><span>23 500 - 26 800 PLN/month</span></div>
            <div><span>23 500 - 26 800 PLN/month</span></div>
            <div><span>Antal Sp. z o.o.</span></div>
            <div><span>Wrocław</span></div>
            <div><span>Remote</span></div>
            <div><span>2d left</span></div>
            <div>
              <span>Redis</span>
              <span>PostgreSQL</span>
              <span>TypeScript</span>
            </div>
          </div>
        </a>
      </main>
    `;

    const adapter = new JustJoinItAdapter();

    const offers = adapter.parseListings(html);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      title: "Node.js Developer",
      company: "Accenture",
      salaryText: undefined,
      location: "Warszawa, +3Locations"
    });
    expect(offers[1]).toMatchObject({
      title: "QA Automation Engineer",
      company: "Antal Sp. z o.o.",
      salaryText: "23 500 - 26 800 PLN/month",
      location: "Wrocław"
    });
  });
});

describe("NoFluffJobsAdapter", () => {
  test("discovers listings across paginated pages", async () => {
    const page1 = readFileSync(
      "tests/fixtures/nofluffjobs-listing-page1.html",
      "utf8"
    );
    const page2 = readFileSync(
      "tests/fixtures/nofluffjobs-listing-page2.html",
      "utf8"
    );
    const adapter = new NoFluffJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://nofluffjobs.com/pl/warszawa/javascript") {
        return page1;
      }

      if (url === "https://nofluffjobs.com/pl/warszawa/javascript?page=2") {
        return page2;
      }

      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://nofluffjobs.com",
        maxListings: 3,
        filters: {
          keyword: "javascript",
          location: "warszawa"
        }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://nofluffjobs.com/pl/warszawa/javascript",
      "https://nofluffjobs.com/pl/warszawa/javascript?page=2"
    ]);
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      externalId:
        "nofluffjobs:/pl/job/projektant-projektantka-aplikacji-javascript-pko-finat-warszawa",
      source: "nofluffjobs",
      url: "https://nofluffjobs.com/pl/job/projektant-projektantka-aplikacji-javascript-pko-finat-warszawa",
      title: "Projektant / Projektantka Aplikacji (JavaScript)",
      company: "PKO Finat Sp. z o.o.",
      salaryText: "20 160 - 24 360 PLN",
      location: "Warszawa"
    });
    expect(offers[2]).toMatchObject({
      externalId:
        "nofluffjobs:/pl/job/full-stack-software-engineer-node-js-react-js-aws-bayer-warsaw",
      company: "Bayer",
      location: "Warsaw"
    });
  });
});
