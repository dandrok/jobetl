import * as cheerio from "cheerio";

import type {
  BulldogjobSearchFilters,
  JobListing,
  SourceConfig
} from "../types.js";
import type { SourceAdapter } from "./types.js";

function cleanText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function normalizeKeyword(value: string): string {
  return encodeURIComponent(value.trim());
}

function isJobPathname(pathname: string): boolean {
  return /^\/companies\/jobs\/\d/.test(pathname);
}

export class BulldogjobAdapter implements SourceAdapter<"bulldogjob"> {
  readonly source = "bulldogjob" as const;

  buildSearchUrl(
    filters: BulldogjobSearchFilters,
    baseUrl: string,
    page = 1
  ): string {
    if (!filters.keyword) {
      throw new Error("Bulldogjob requires filters.keyword");
    }

    const keyword = normalizeKeyword(filters.keyword);
    const path =
      page === 1
        ? `/companies/jobs/s/skills,${keyword}`
        : `/companies/jobs/s/skills,${keyword}/page,${page}`;

    return new URL(path, baseUrl).toString();
  }

  parseListings(html: string, baseUrl: string): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();

    $('a[href*="/companies/jobs/"]').each((_, element) => {
      const href = $(element).attr("href");
      if (!href) {
        return;
      }

      const url = new URL(href, baseUrl).toString();
      const pathname = new URL(url).pathname;
      if (!isJobPathname(pathname)) {
        return;
      }

      const title = cleanText($(element).find("h3").first().text());
      const titleBlock = $(element).find("h3").first().parent();
      const company =
        cleanText($(element).find("img[alt]").first().attr("alt")) ??
        cleanText(titleBlock.find("div").first().text());
      const location = cleanText(
        titleBlock.next().find("div").first().text()
      );

      if (!title || !company) {
        return;
      }

      const externalId = `${this.source}:${pathname}`;

      offers.set(externalId, {
        externalId,
        source: this.source,
        url,
        title,
        company,
        location
      });
    });

    return [...offers.values()];
  }

  async discoverListings(
    config: SourceConfig<BulldogjobSearchFilters>,
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
    }

    return offers.slice(0, config.maxListings);
  }
}
