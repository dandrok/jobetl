import * as cheerio from "cheerio";

import type { JobListing, NoFluffJobsSearchFilters, SourceConfig } from "@core/types";
import { JobListingSchema } from "@core/types";
import { Telemetry } from "@core/telemetry";
import type { SourceAdapter } from "@scrapers/types";
import { listingsPerKeyword, resolveSearchKeywords } from "@scrapers/keywords";

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
      const company =
        cleanText($(element).find("h4").first().text()) ||
        cleanText($(element).find('inline-icon[commonicon="job_offer"]').parent().text());
      const salaryText = $(element)
        .find("div, span")
        .map((__, child) => cleanText($(child).text()))
        .get()
        .find((value): value is string => Boolean(value) && isSalaryText(value));

      const rawLocation =
        cleanText(
          $(element).find('[data-cy="location on the job offer listing"]').first().text()
        ) ||
        cleanText(
          $(element)
            .find('inline-icon[maticon="location_on_outline"]')
            .parent()
            .find(".tw-truncate")
            .first()
            .text()
        ) ||
        cleanText($(element).find("h4").first().nextAll("div, span").first().text());
      const location = normalizeLocation(rawLocation);

      if (!href) {
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
    const configuredTerms = resolveSearchKeywords(config.filters);
    const searchTerms: Array<string | undefined> =
      configuredTerms.length > 0 ? configuredTerms : [undefined];
    const offers = new Map<string, JobListing>();
    const maxPagesPerKeyword = 20;

    for (let termIndex = 0; termIndex < searchTerms.length; termIndex += 1) {
      if (offers.size >= config.maxListings) {
        break;
      }

      const term = searchTerms[termIndex];
      const perKeywordLimit = listingsPerKeyword(
        config.maxListings - offers.size,
        searchTerms.length - termIndex
      );
      const seenForTerm = new Set<string>();
      let keywordListings = 0;

      for (
        let page = 1;
        keywordListings < perKeywordLimit &&
        offers.size < config.maxListings &&
        page <= maxPagesPerKeyword;
        page += 1
      ) {
        const url = this.buildSearchUrl({ ...config.filters, keyword: term }, config.baseUrl, page);
        const html = await fetchHtml(url);
        const pageOffers = this.parseListings(html, config.baseUrl);

        if (pageOffers.length === 0) {
          break;
        }

        let newForTerm = 0;
        for (const offer of pageOffers) {
          if (seenForTerm.has(offer.externalId)) {
            continue;
          }
          seenForTerm.add(offer.externalId);
          newForTerm += 1;

          if (keywordListings >= perKeywordLimit || offers.size >= config.maxListings) {
            continue;
          }
          if (offers.has(offer.externalId)) {
            continue;
          }

          offers.set(offer.externalId, offer);
          keywordListings += 1;
        }

        if (newForTerm === 0) {
          break;
        }

        if (!/nfjloadmore|Pokaż kolejne oferty/i.test(html)) {
          break;
        }
      }
    }

    const allOffers = [...offers.values()];
    if (allOffers.length === 0) {
      Telemetry.recordScrapeZeroYield(this.source, config.baseUrl);
    }
    const finalOffers = allOffers.slice(0, config.maxListings);
    const scrapeTime = Date.now();

    return finalOffers.map((offer, index) => ({
      ...offer,
      discoveredAt: new Date(scrapeTime - index * 1000).toISOString()
    }));
  }
}
