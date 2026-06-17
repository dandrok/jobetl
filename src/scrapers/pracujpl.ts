import * as cheerio from "cheerio";

import type { JobListing, PracujPlSearchFilters, SourceConfig } from "@core/types";
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

export class PracujPlAdapter implements SourceAdapter<"pracujpl"> {
  readonly source = "pracujpl" as const;

  buildSearchUrl(filters: PracujPlSearchFilters, baseUrl: string, page = 1): string {
    const segments = ["/praca"];

    if (filters.keyword) {
      segments.push(`/${slugify(filters.keyword)};kw`);
    }

    if (filters.location) {
      segments.push(`/${slugify(filters.location)};wp`);
    }

    const url = new URL(segments.join(""), baseUrl);
    if (page > 1) {
      url.searchParams.set("pn", String(page));
    }

    return url.toString();
  }

  parseListings(html: string, baseUrl: string): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();

    const links = $('a[href*="oferta"]').filter((_, el) => {
      const href = $(el).attr("href");
      return Boolean(href && href.includes("pracuj.pl"));
    });

    links.each((_, element) => {
      const a = $(element);
      const href = a.attr("href");
      if (!href) return;

      const wrapper = a.closest("div");
      if (wrapper.length === 0) return;

      const title = cleanText(wrapper.find("h2").first().text() || a.text());
      const company = cleanText(wrapper.find("h3, h4").first().text());
      const location = cleanText(wrapper.find("h4, h5").last().text());

      const spans = wrapper
        .find("span")
        .map((__, el) => $(el).text())
        .get();
      const salaryTextRaw = spans.find((text) => /PLN|zł/i.test(text) && /\d/.test(text));
      const salaryText = cleanText(salaryTextRaw);

      if (!href || !title || !company) {
        if (href) {
          const debugUrl = new URL(href, baseUrl).toString();
          Telemetry.recordScrapeValidationFailure(
            this.source,
            debugUrl,
            new Error("Missing required title or company from DOM")
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
        salaryText,
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
    config: SourceConfig<PracujPlSearchFilters>,
    fetchHtml: (url: string, init?: RequestInit) => Promise<string>
  ): Promise<JobListing[]> {
    const offers: JobListing[] = [];

    for (let page = 1; offers.length < config.maxListings; page += 1) {
      const targetUrl = this.buildSearchUrl(config.filters, config.baseUrl, page);
      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(targetUrl)}`;

      const html = await fetchHtml(jinaUrl, {
        headers: { "x-return-format": "html" }
      });
      const pageOffers = this.parseListings(html, config.baseUrl);

      if (pageOffers.length === 0) {
        break;
      }

      offers.push(...pageOffers);

      // Stop if there are no more pages
      if (pageOffers.length < 10) {
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
