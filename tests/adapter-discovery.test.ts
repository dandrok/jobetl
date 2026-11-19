import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { BulldogjobAdapter } from "@scrapers/bulldogjob";
import { JustJoinItAdapter } from "@scrapers/justjoinit";
import { NoFluffJobsAdapter } from "@scrapers/nofluffjobs";
import { PracujPlAdapter } from "@scrapers/pracujpl";
import { listingsPerKeyword, resolveSearchKeywords } from "@scrapers/keywords";

function justJoinItCard(slug: string, title: string, company: string): string {
  return `
    <div>
      <a href="/job-offer/${slug}" title="${title}">
        <div>
          <div><h3>${title}</h3></div>
          <div><span>${company}</span></div>
          <div><span>Warszawa</span></div>
        </div>
      </a>
    </div>
  `;
}

function noFluffCard(slug: string, title: string, company: string): string {
  return `
    <a href="/pl/job/${slug}">
      <h3>${title}</h3>
      <h4>${company}</h4>
      <div><span>Warszawa</span></div>
    </a>
  `;
}

function bulldogCard(id: number, title: string, company: string): string {
  return `
    <a href="https://bulldogjob.com/companies/jobs/${id}-${title.toLowerCase().replace(/\s+/g, "-")}">
      <img alt="${company}" />
      <h3>${title}</h3>
    </a>
  `;
}

function pracujCard(path: string, title: string, company: string): string {
  return `
    <div>
      <a href="https://it.pracuj.pl/praca/${path},oferta,1"><h2>${title}</h2></a>
      <h3>${company}</h3>
      <h4>Warszawa</h4>
    </div>
  `;
}

describe("resolveSearchKeywords", () => {
  test("prefers the keywords array", () => {
    expect(resolveSearchKeywords({ keyword: "legacy", keywords: ["react", "typescript"] })).toEqual(
      ["react", "typescript"]
    );
  });

  test("falls back to the legacy single keyword", () => {
    expect(resolveSearchKeywords({ keyword: "javascript" })).toEqual(["javascript"]);
  });

  test("trims, drops empty entries, and dedupes case-insensitively", () => {
    expect(resolveSearchKeywords({ keywords: [" React ", "react", "", "TypeScript"] })).toEqual([
      "React",
      "TypeScript"
    ]);
  });

  test("returns an empty list when nothing is configured", () => {
    expect(resolveSearchKeywords({})).toEqual([]);
  });
});

describe("listingsPerKeyword", () => {
  test("a single keyword keeps the full budget", () => {
    expect(listingsPerKeyword(200, 1)).toBe(200);
  });

  test("splits the budget evenly across terms", () => {
    expect(listingsPerKeyword(200, 6)).toBe(34);
  });

  test("never returns zero", () => {
    expect(listingsPerKeyword(1, 6)).toBe(1);
  });
});

describe("JustJoinItAdapter discovery", () => {
  test("paginates a single keyword until maxListings is reached", async () => {
    const page1 = readFileSync("tests/fixtures/justjoinit-listing.html", "utf8");
    const page2 = justJoinItCard(
      "react-frontend-warszawa-react",
      "React Frontend Developer",
      "ReactCo"
    );
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript") {
        return page1;
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript&page=2") {
        return page2;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 3,
        filters: { keyword: "javascript" }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://justjoin.it/job-offers/all-locations?keyword=javascript",
      "https://justjoin.it/job-offers/all-locations?keyword=javascript&page=2"
    ]);
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.title)).toContain("React Frontend Developer");
  });

  test("keeps scanning a later keyword when its first page overlaps earlier results", async () => {
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript") {
        return justJoinItCard("shared-frontend", "Shared Frontend Role", "Acme");
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript&page=2") {
        return "<main></main>";
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=react") {
        return justJoinItCard("shared-frontend", "Shared Frontend Role", "Acme");
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=react&page=2") {
        return justJoinItCard("react-only", "React Only Role", "ReactCo");
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=react&page=3") {
        return "<main></main>";
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 4,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toContain(
      "https://justjoin.it/job-offers/all-locations?keyword=react&page=2"
    );
    expect(offers.map((offer) => offer.externalId)).toEqual([
      "justjoinit:/job-offer/shared-frontend",
      "justjoinit:/job-offer/react-only"
    ]);
  });

  test("rolls unused keyword budget into later terms", async () => {
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript") {
        return justJoinItCard("js-only", "JavaScript Only", "JSCo");
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript&page=2") {
        return "<main></main>";
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=react") {
        return (
          justJoinItCard("react-one", "React One", "ReactCo") +
          justJoinItCard("react-two", "React Two", "ReactCo")
        );
      }
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=react&page=2") {
        return justJoinItCard("react-three", "React Three", "ReactCo");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 4,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(offers).toHaveLength(4);
    expect(fetchHtml.mock.calls.map(([url]) => url)).toContain(
      "https://justjoin.it/job-offers/all-locations?keyword=react&page=2"
    );
  });

  test("stops before later keywords once maxListings is reached", async () => {
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://justjoin.it/job-offers/all-locations?keyword=javascript") {
        return justJoinItCard("js-only", "JavaScript Only", "JSCo");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 1,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(offers).toHaveLength(1);
  });

  test("uses the unfiltered feed when no keywords are configured", async () => {
    const adapter = new JustJoinItAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://justjoin.it/job-offers/all-locations") {
        return justJoinItCard("default-feed", "Default Feed Role", "Acme");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://justjoin.it",
        maxListings: 1,
        filters: {}
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://justjoin.it/job-offers/all-locations"
    ]);
    expect(offers).toHaveLength(1);
  });
});

describe("NoFluffJobsAdapter discovery", () => {
  test("searches every configured keyword", async () => {
    const adapter = new NoFluffJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://nofluffjobs.com/pl/javascript?sort=newest") {
        return noFluffCard("javascript-role", "JavaScript Developer", "JSCo");
      }
      if (url === "https://nofluffjobs.com/pl/react?sort=newest") {
        return noFluffCard("react-role", "React Developer", "ReactCo");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://nofluffjobs.com",
        maxListings: 2,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://nofluffjobs.com/pl/javascript?sort=newest",
      "https://nofluffjobs.com/pl/react?sort=newest"
    ]);
    expect(offers.map((offer) => offer.title)).toEqual(["JavaScript Developer", "React Developer"]);
  });

  test("continues paginating a later keyword when its first page overlaps earlier results", async () => {
    const morePages = "<button>nfjloadmore</button>";
    const adapter = new NoFluffJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://nofluffjobs.com/pl/javascript?sort=newest") {
        return noFluffCard("shared-role", "Shared Role", "Acme") + morePages;
      }
      if (url === "https://nofluffjobs.com/pl/javascript?sort=newest&page=2") {
        return noFluffCard("react-only", "React Only Role", "ReactCo") + morePages;
      }
      if (url === "https://nofluffjobs.com/pl/react?sort=newest") {
        return noFluffCard("shared-role", "Shared Role", "Acme") + morePages;
      }
      if (url === "https://nofluffjobs.com/pl/react?sort=newest&page=2") {
        return noFluffCard("react-page-two", "React Page Two", "ReactCo") + morePages;
      }
      if (url === "https://nofluffjobs.com/pl/react?sort=newest&page=3") {
        return "<main></main>";
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://nofluffjobs.com",
        maxListings: 4,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toContain(
      "https://nofluffjobs.com/pl/react?sort=newest&page=2"
    );
    expect(offers.map((offer) => offer.externalId)).toContain("nofluffjobs:/pl/job/react-page-two");
  });

  test("uses the unfiltered feed when no keywords are configured", async () => {
    const adapter = new NoFluffJobsAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://nofluffjobs.com/pl?sort=newest") {
        return noFluffCard("default-role", "Default Role", "Acme");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://nofluffjobs.com",
        maxListings: 1,
        filters: {}
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://nofluffjobs.com/pl?sort=newest"
    ]);
    expect(offers).toHaveLength(1);
  });
});

describe("BulldogjobAdapter discovery", () => {
  test("searches every configured keyword", async () => {
    const adapter = new BulldogjobAdapter();
    const fetchHtml = vi.fn(async (url: string) => {
      if (url === "https://bulldogjob.com/companies/jobs/s/skills,JavaScript") {
        return bulldogCard(101, "JavaScript Developer", "JSCo");
      }
      if (url === "https://bulldogjob.com/companies/jobs/s/skills,React") {
        return bulldogCard(102, "React Developer", "ReactCo");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://bulldogjob.com",
        maxListings: 2,
        filters: { keywords: ["JavaScript", "React"] }
      },
      fetchHtml
    );

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([
      "https://bulldogjob.com/companies/jobs/s/skills,JavaScript",
      "https://bulldogjob.com/companies/jobs/s/skills,React"
    ]);
    expect(offers.map((offer) => offer.title)).toEqual(["JavaScript Developer", "React Developer"]);
  });

  test("throws when no keyword is configured", async () => {
    const adapter = new BulldogjobAdapter();
    const fetchHtml = vi.fn(async () => {
      throw new Error("should not fetch");
    });

    await expect(
      adapter.discoverListings(
        {
          enabled: true,
          baseUrl: "https://bulldogjob.com",
          maxListings: 1,
          filters: {}
        },
        fetchHtml
      )
    ).rejects.toThrow("Bulldogjob requires filters.keyword or filters.keywords");
    expect(fetchHtml).not.toHaveBeenCalled();
  });
});

describe("PracujPlAdapter discovery", () => {
  test("searches every configured keyword", async () => {
    const adapter = new PracujPlAdapter();
    const fetchHtml = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("javascript%3Bkw")) {
        return pracujCard("javascript-dev", "JavaScript Developer", "JSCo");
      }
      if (url.includes("react%3Bkw")) {
        return pracujCard("react-dev", "React Developer", "ReactCo");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://it.pracuj.pl",
        maxListings: 2,
        filters: { keywords: ["javascript", "react"] }
      },
      fetchHtml
    );

    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(offers.map((offer) => offer.title)).toEqual(["JavaScript Developer", "React Developer"]);
  });

  test("paginates when a page is full", async () => {
    const page1 = Array.from({ length: 10 }, (_, index) =>
      pracujCard(`role-${index}`, `Role ${index}`, "Acme")
    ).join("");
    const page2 = Array.from({ length: 2 }, (_, index) =>
      pracujCard(`role-${index + 10}`, `Role ${index + 10}`, "Acme")
    ).join("");
    const adapter = new PracujPlAdapter();
    const fetchHtml = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("pn%3D2")) {
        return page2;
      }
      if (url.includes("javascript%3Bkw")) {
        return page1;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://it.pracuj.pl",
        maxListings: 12,
        filters: { keyword: "javascript" }
      },
      fetchHtml
    );

    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(offers).toHaveLength(12);
  });

  test("uses the unfiltered feed when no keywords are configured", async () => {
    const adapter = new PracujPlAdapter();
    const fetchHtml = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("it.pracuj.pl%2Fpraca")) {
        return pracujCard("default-role", "Default Role", "Acme");
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const offers = await adapter.discoverListings(
      {
        enabled: true,
        baseUrl: "https://it.pracuj.pl",
        maxListings: 1,
        filters: {}
      },
      fetchHtml
    );

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(offers).toHaveLength(1);
  });
});
