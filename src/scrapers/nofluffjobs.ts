import * as cheerio from "cheerio";

import type { JobListing, NoFluffJobsSearchFilters, SourceConfig } from "@core/types";
import { JobListingSchema } from "@core/types";
import { Telemetry } from "@core/telemetry";
import type { SourceAdapter } from "@scrapers/types";

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
  return /\b\d[\d\s]*(?:-|–)\s*\d[\d\s]*\s+PLN\b/.test(value) || /\b\d[\d\s]*\s+PLN\b/.test(value);
}

function normalizeLocation(value: string | undefined): string | undefined {
  const cleaned = cleanText(value);
  return cleaned?.replace(/\s*\+\d+.*$/, "");
}

export class NoFluffJobsAdapter implements SourceAdapter<"nofluffjobs"> {
  readonly source = "nofluffjobs" as const;

  buildSearchUrl(filters: NoFluffJobsSearchFilters, baseUrl: string, page = 1): string {
    const segments = ["/pl"];

    if (filters.location) {
      segments.push(`/${slugify(filters.location)}`);
    }

    if (filters.keyword) {
      segments.push(`/${slugify(filters.keyword)}`);
    }

    const url = new URL(segments.join(""), baseUrl);
    url.searchParams.set("sort", "newest");

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
      const rawTitle = cleanText($(element).find("h3").first().text()) ?? "";
      const title = rawTitle.replace(/\s+NOWA$/u, "");
      const company = cleanText($(element).find("h4").first().text());
      const salaryText = $(element)
        .find("div, span")
        .map((__, child) => cleanText($(child).text()))
        .get()
        .find((value): value is string => Boolean(value) && isSalaryText(value));

      const location = normalizeLocation(
        $(element).find("h4").first().nextAll("div, span").first().text()
      );

      if (!href || !title || !company) {
        if (href) {
          const debugUrl = new URL(href, baseUrl).toString();
          Telemetry.recordScrapeValidationFailure(
            this.source,
            debugUrl,
            new Error("Missing required title or company from DOM") as any
          );
        }
        return;
      }

      const url = new URL(href, baseUrl).toString();
      const externalId = `${this.source}:${new URL(url).pathname}`;

      const rawOffer = {
        externalId,
        source: this.source,
        url,
        title,
        company,
        salaryText: salaryText ? normalizeSalaryText(salaryText) : undefined,
        location
      };

      const result = JobListingSchema.safeParse(rawOffer);
      if (result.success) {
        offers.set(externalId, result.data);
      } else {
        Telemetry.recordScrapeValidationFailure(this.source, url, result.error);
      }
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

    if (offers.length === 0) {
      Telemetry.recordScrapeZeroYield(this.source, config.baseUrl);
    }
    const finalOffers = offers.slice(0, config.maxListings);
    const scrapeTime = Date.now();

    return finalOffers.map((offer, index) => ({
      ...offer,
      discoveredAt: new Date(scrapeTime - index * 1000).toISOString()
    }));
  }
}
