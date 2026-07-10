import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { BulldogjobAdapter } from "@scrapers/bulldogjob";
import { JustJoinItAdapter } from "@scrapers/justjoinit";
import { NoFluffJobsAdapter } from "@scrapers/nofluffjobs";
import { TheSmartJobsAdapter } from "@scrapers/thesmartjobs";

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
        <div>
          <a href="/job-offer/accenture-node-js-developer-warszawa-javascript" title="Node.js Developer">
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
        </div>
        <div>
          <a href="/job-offer/antal-sp-z-o-o--qa-automation-engineer-wroclaw-testing" title="QA Automation Engineer">
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
        </div>
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
    const page1 = readFileSync("tests/fixtures/nofluffjobs-listing-page1.html", "utf8");
    const page2 = readFileSync("tests/fixtures/nofluffjobs-listing-page2.html", "utf8");
    const adapter = new NoFluffJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://nofluffjobs.com/pl/warszawa/javascript?sort=newest") {
        return page1;
      }

      if (url === "https://nofluffjobs.com/pl/warszawa/javascript?sort=newest&page=2") {
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
      "https://nofluffjobs.com/pl/warszawa/javascript?sort=newest",
      "https://nofluffjobs.com/pl/warszawa/javascript?sort=newest&page=2"
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

describe("BulldogjobAdapter", () => {
  test("discovers listings across classic paginated pages", async () => {
    const page1 = readFileSync("tests/fixtures/bulldogjob-listing-page1.html", "utf8");
    const page2 = readFileSync("tests/fixtures/bulldogjob-listing-page2.html", "utf8");
    const adapter = new BulldogjobAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://bulldogjob.com/companies/jobs/s/skills,JavaScript") {
        return page1;
      }

      if (url === "https://bulldogjob.com/companies/jobs/s/skills,JavaScript/page,2") {
        return page2;
      }

      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://bulldogjob.com",
        maxListings: 3,
        filters: {
          keyword: "JavaScript"
        }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://bulldogjob.com/companies/jobs/s/skills,JavaScript",
      "https://bulldogjob.com/companies/jobs/s/skills,JavaScript/page,2"
    ]);
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      externalId:
        "bulldogjob:/companies/jobs/206810-wealth-platforms-junior-programmer-warsaw-accenture-polska",
      source: "bulldogjob",
      url: "https://bulldogjob.com/companies/jobs/206810-wealth-platforms-junior-programmer-warsaw-accenture-polska",
      title: "Wealth Platforms Junior Programmer",
      company: "Accenture Polska",
      location: "Warsaw"
    });
    expect(offers[2]).toMatchObject({
      externalId: "bulldogjob:/companies/jobs/236466-senior-frontend-engineer-madrid-aircall",
      company: "Aircall",
      location: "Madrid"
    });
  });
});

describe("TheSmartJobsAdapter", () => {
  test("discovers listings across paginated JSON API pages", async () => {
    const page1Data = {
      data: [
        {
          id: "job-1",
          title: "Senior Node Developer",
          slug: "senior-node-developer-1234",
          slugUrl: "jobs/senior-node-developer-1234",
          company: { name: "Acme Corp" },
          salaries: [
            { min: 15000, max: 20000, currency: "PLN", period: "monthly", contractType: "b2b" }
          ],
          locations: [{ city: "Warszawa" }]
        },
        {
          id: "job-2",
          title: "QA Engineer",
          slug: "qa-engineer-5678",
          slugUrl: "praca/qa-engineer-5678",
          company: { name: "TestCo" },
          salaries: [],
          locations: []
        }
      ],
      meta: {
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2
      }
    };

    const page2Data = {
      data: [
        {
          id: "job-3",
          title: "Frontend Developer",
          slug: "frontend-developer-9012",
          slugUrl: "jobs/frontend-developer-9012",
          company: { name: "WebCorp" },
          salaries: [
            {
              min: 10000,
              max: 15000,
              currency: "PLN",
              period: "monthly",
              contractType: "employmentContract"
            }
          ],
          locations: [{ city: "Kraków" }]
        }
      ],
      meta: {
        total: 3,
        page: 2,
        limit: 2,
        totalPages: 2
      }
    };

    const adapter = new TheSmartJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes("page=1")) {
        return JSON.stringify(page1Data);
      }
      if (url.includes("page=2")) {
        return JSON.stringify(page2Data);
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://thesmartjobs.com",
        maxListings: 3,
        filters: {
          category: "it-03989325",
          sort: "freshness"
        }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://thesmartjobs.com/api/jobs/search?categories=it-03989325&sort=freshness&locale=pl&page=1",
      "https://thesmartjobs.com/api/jobs/search?categories=it-03989325&sort=freshness&locale=pl&page=2"
    ]);

    expect(offers).toHaveLength(3);

    expect(offers[0]).toMatchObject({
      externalId: "thesmartjobs:job-1",
      source: "thesmartjobs",
      url: "https://thesmartjobs.com/pl/jobs/senior-node-developer-1234",
      title: "Senior Node Developer",
      company: "Acme Corp",
      salaryText: "15000 - 20000 PLN / monthly (b2b)",
      location: "Warszawa"
    });

    expect(offers[1]).toMatchObject({
      externalId: "thesmartjobs:job-2",
      source: "thesmartjobs",
      url: "https://thesmartjobs.com/pl/praca/qa-engineer-5678",
      title: "QA Engineer",
      company: "TestCo",
      salaryText: undefined,
      location: undefined
    });

    expect(offers[2]).toMatchObject({
      externalId: "thesmartjobs:job-3",
      source: "thesmartjobs",
      url: "https://thesmartjobs.com/pl/jobs/frontend-developer-9012",
      title: "Frontend Developer",
      company: "WebCorp",
      salaryText: "10000 - 15000 PLN / monthly (employmentContract)",
      location: "Kraków"
    });
  });

  test("isolates errors per-record and per-page, and handles slug fallback", async () => {
    const page1Data = {
      data: [
        {
          id: "job-valid-1",
          title: "Valid Senior Node Developer",
          slugUrl: "jobs/valid-1",
          company: { name: "Acme Corp" }
        },
        {
          title: "Missing ID Job",
          slugUrl: "jobs/missing-id",
          company: { name: "Acme Corp" }
        },
        {
          id: "job-missing-title",
          slugUrl: "jobs/missing-title",
          company: { name: "Acme Corp" }
        },
        {
          id: "job-fallback-slug",
          title: "Fallback Slug Job",
          slug: "fallback-slug-path",
          company: { name: "Acme Corp" }
        },
        {
          id: "job-zod-fail",
          title: "A",
          slugUrl: "jobs/zod-fail",
          company: { name: "Acme Corp" }
        }
      ],
      meta: {
        total: 5,
        page: 1,
        limit: 2,
        totalPages: 3
      }
    };

    const page3Data = {
      data: [
        {
          id: "job-valid-3",
          title: "Valid Frontend Developer",
          slugUrl: "jobs/valid-3",
          company: { name: "WebCorp" }
        }
      ],
      meta: {
        total: 5,
        page: 3,
        limit: 2,
        totalPages: 3
      }
    };

    const adapter = new TheSmartJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes("page=1")) {
        return JSON.stringify(page1Data);
      }
      if (url.includes("page=2")) {
        throw new Error("Simulated page 2 fetch failure");
      }
      if (url.includes("page=3")) {
        return JSON.stringify(page3Data);
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://thesmartjobs.com",
        maxListings: 10,
        filters: {
          category: "it-03989325"
        }
      },
      fetchHtml
    );

    const requestedUrls = fetchHtml.mock.calls.map(([url]) => url);
    expect(requestedUrls).toEqual([
      "https://thesmartjobs.com/api/jobs/search?categories=it-03989325&locale=pl&page=1",
      "https://thesmartjobs.com/api/jobs/search?categories=it-03989325&locale=pl&page=2",
      "https://thesmartjobs.com/api/jobs/search?categories=it-03989325&locale=pl&page=3"
    ]);

    expect(offers).toHaveLength(3);

    expect(offers[0]).toMatchObject({
      externalId: "thesmartjobs:job-valid-1",
      url: "https://thesmartjobs.com/pl/jobs/valid-1",
      title: "Valid Senior Node Developer"
    });

    expect(offers[1]).toMatchObject({
      externalId: "thesmartjobs:job-fallback-slug",
      url: "https://thesmartjobs.com/pl/jobs/fallback-slug-path",
      title: "Fallback Slug Job"
    });

    expect(offers[2]).toMatchObject({
      externalId: "thesmartjobs:job-valid-3",
      url: "https://thesmartjobs.com/pl/jobs/valid-3",
      title: "Valid Frontend Developer"
    });
  });

  test("returns safe fallback when JSON response envelope is malformed", () => {
    const adapter = new TheSmartJobsAdapter();

    // 1. payload is null
    let result = adapter.parseListings("null", "https://thesmartjobs.com");
    expect(result).toEqual({ listings: [], totalPages: 0, pageSize: 20 });

    // 2. payload.data is not an array
    result = adapter.parseListings(JSON.stringify({ data: {} }), "https://thesmartjobs.com");
    expect(result).toEqual({ listings: [], totalPages: 0, pageSize: 20 });

    // 3. meta.totalPages is not a non-negative integer
    result = adapter.parseListings(
      JSON.stringify({ data: [], meta: { totalPages: -1 } }),
      "https://thesmartjobs.com"
    );
    expect(result).toEqual({ listings: [], totalPages: 0, pageSize: 20 });

    result = adapter.parseListings(
      JSON.stringify({ data: [], meta: { totalPages: 1.5 } }),
      "https://thesmartjobs.com"
    );
    expect(result).toEqual({ listings: [], totalPages: 0, pageSize: 20 });
  });
});
