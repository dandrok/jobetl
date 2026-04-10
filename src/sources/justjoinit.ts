import * as cheerio from "cheerio";

import type { JobListing, SearchFilters } from "../types.js";

const JUSTJOINIT_ROOT = "https://justjoin.it";

function cleanText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function normalizeUrl(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return new URL(href, JUSTJOINIT_ROOT).toString();
}

export class JustJoinItAdapter {
  readonly source = "justjoinit" as const;

  buildSearchUrl(filters: SearchFilters): string {
    const url = new URL("/job-offers/all-locations", JUSTJOINIT_ROOT);

    if (filters.keyword) {
      url.searchParams.set("keyword", filters.keyword);
    }
    if (filters.categorySlug) {
      url.searchParams.set("category", filters.categorySlug);
    }
    if (filters.location) {
      url.searchParams.set("location", filters.location);
    }
    if (filters.workingMode) {
      url.searchParams.set("working-mode", filters.workingMode);
    }
    if (filters.experienceLevel) {
      url.searchParams.set("experience-level", filters.experienceLevel);
    }
    if (filters.minSalary) {
      url.searchParams.set("salary-from", String(filters.minSalary));
    }
    if (filters.salaryCurrency) {
      url.searchParams.set("salary-currency", filters.salaryCurrency);
    }
    if (filters.withSalaryOnly) {
      url.searchParams.set("with-salary", "true");
    }

    return url.toString();
  }

  parseListings(html: string): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();

    $("a[href*=\"/job-offer/\"]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) {
        return;
      }

      const url = normalizeUrl(href);
      const externalId = `${this.source}:${new URL(url).pathname}`;
      const textNodes = $(element)
        .find("span, h2, h3, div, p")
        .map((__, child) => cleanText($(child).text()))
        .get()
        .filter((value): value is string => Boolean(value));

      const title = textNodes[0];
      const company = textNodes[1];
      const salaryText = textNodes.find(
        (value) =>
          /\b(PLN|USD|EUR)\b/i.test(value) || /Undisclosed Salary/i.test(value)
      );
      const location = textNodes.find(
        (value) =>
          value !== title &&
          value !== company &&
          value !== salaryText &&
          !/\b(PLN|USD|EUR)\b/i.test(value)
      );

      if (!title || !company) {
        return;
      }

      offers.set(externalId, {
        externalId,
        source: this.source,
        url,
        title,
        company,
        salaryText:
          salaryText && !/Undisclosed Salary/i.test(salaryText)
            ? salaryText
            : undefined,
        location
      });
    });

    return [...offers.values()];
  }
}
