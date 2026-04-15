import * as cheerio from "cheerio";

import type {
  JobListing,
  NoFluffJobsSearchFilters,
  SourceConfig
} from "../types.js";
import type { SourceAdapter } from "./types.js";

function cleanText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeSalaryText(value: string): string {
  return value.replace(/–/g, "-");
}

function isSalaryText(value: string): boolean {
  return (
    /\b\d[\d\s]*(?:-|–)\s*\d[\d\s]*\s+PLN\b/.test(value) ||
    /\b\d[\d\s]*\s+PLN\b/.test(value)
  );
}

function normalizeLocation(value: string | undefined): string | undefined {
  const cleaned = cleanText(value);
  return cleaned?.replace(/\s*\+\d+.*$/, "");
}

export class NoFluffJobsAdapter implements SourceAdapter<"nofluffjobs"> {
  readonly source = "nofluffjobs" as const;

  buildSearchUrl(
    filters: NoFluffJobsSearchFilters,
    baseUrl: string,
    page = 1
  ): string {
    const segments = ["/pl"];

    if (filters.location) {
      segments.push(`/${slugify(filters.location)}`);
    }

    if (filters.keyword) {
      segments.push(`/${slugify(filters.keyword)}`);
    }

    const url = new URL(segments.join(""), baseUrl);
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }

    return url.toString();
  }

  parseListings(html: string, baseUrl: string): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();

    $('a[href^="/pl/job/"]').each((_, element) => {
      const href = $(element).attr("href");
      const title = cleanText($(element).find("h3").first().text())?.replace(
        /\s+NOWA$/u,
        ""
      );
      const company = cleanText($(element).find("h4").first().text());
      const salaryText = $(element)
        .find("div, span")
        .map((__, child) => cleanText($(child).text()))
        .get()
        .find((value): value is string => Boolean(value) && isSalaryText(value));

      const location = normalizeLocation(
        $(element)
          .find("h4")
          .first()
          .nextAll("div, span")
          .first()
          .text()
      );

      if (!href || !title || !company) {
        return;
      }

      const url = new URL(href, baseUrl).toString();
      const externalId = `${this.source}:${new URL(url).pathname}`;

      offers.set(externalId, {
        externalId,
        source: this.source,
        url,
        title,
        company,
        salaryText: salaryText ? normalizeSalaryText(salaryText) : undefined,
        location
      });
    });

    return [...offers.values()];
  }

  async discoverListings(
    config: SourceConfig<NoFluffJobsSearchFilters>,
    fetchHtml: (url: string) => Promise<string>
  ): Promise<JobListing[]> {
    const offers: JobListing[] = [];

    for (let page = 1; offers.length < config.maxListings; page += 1) {
      const url = this.buildSearchUrl(config.filters, config.baseUrl, page);
      const html = await fetchHtml(url);
      const pageOffers = this.parseListings(html, config.baseUrl);

      if (pageOffers.length === 0) {
        break;
      }

      offers.push(...pageOffers);

      if (!/nfjloadmore|Pokaż kolejne oferty/i.test(html)) {
        break;
      }
    }

    return offers.slice(0, config.maxListings);
  }
}
