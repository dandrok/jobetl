import * as cheerio from "cheerio";

import type { JobListing, JustJoinItSearchFilters, SourceConfig } from "@core/types";
import { JobListingSchema } from "@core/types";
import { Telemetry } from "@core/telemetry";
import type { SourceAdapter } from "@scrapers/types";
import { listingsPerKeyword, resolveSearchKeywords } from "@scrapers/keywords";

const JUSTJOINIT_ROOT = "https://justjoin.it";
const LEAD_BADGES = new Set(["Super offer", "1-click Apply", "New"]);
const META_TEXTS = new Set([
  "Remote",
  "Hybrid",
  "Office",
  "B2B",
  "Permanent",
  "Internship",
  "Mandate contract",
  "Specific-task contract",
  "Full-time",
  "Part-time",
  "Practice / Internship",
  "Freelance",
  "Junior",
  "Mid",
  "Senior",
  "Manager / C-level"
]);

function cleanText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function normalizeUrl(href: string, baseUrl = JUSTJOINIT_ROOT): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return new URL(href, baseUrl).toString();
}

function isSalaryText(value: string): boolean {
  return /\b(PLN|USD|EUR|CHF)\b/i.test(value) || /Undisclosed Salary/i.test(value);
}

function isTimeText(value: string): boolean {
  return /^\d+\s*d left$/i.test(value) || /^Expires tomorrow$/i.test(value);
}

function isIgnorableText(value: string): boolean {
  return LEAD_BADGES.has(value) || META_TEXTS.has(value) || isTimeText(value);
}

function extractLeafTexts(
  $: cheerio.CheerioAPI,
  element: cheerio.AnyNode | cheerio.Cheerio<cheerio.AnyNode>
): string[] {
  const texts = $(element)
    .find("*")
    .map((__, child) => {
      const tagName = child.tagName?.toLowerCase();
      if (!tagName || ["script", "style", "svg", "path"].includes(tagName)) {
        return undefined;
      }

      const $child = $(child);
      if ($child.children().length > 0) {
        return undefined;
      }

      return cleanText($child.text());
    })
    .get()
    .filter((value): value is string => Boolean(value));

  return texts.filter((value, index) => index === 0 || value !== texts[index - 1]);
}

export class JustJoinItAdapter implements SourceAdapter<"justjoinit"> {
  readonly source = "justjoinit" as const;

  buildSearchUrl(filters: JustJoinItSearchFilters, baseUrl = JUSTJOINIT_ROOT, page = 1): string {
    const url = new URL("/job-offers/all-locations", baseUrl);

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
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }

    return url.toString();
  }

  async discoverListings(
    config: SourceConfig<JustJoinItSearchFilters>,
    fetchHtml: (url: string) => Promise<string>
  ): Promise<JobListing[]> {
    const configuredTerms = resolveSearchKeywords(config.filters);
    // No terms configured means one unfiltered pass (the site's default feed).
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

        // Stop only when a page has nothing new for THIS term: that means
        // pagination wrapped or the site ignored `page`. A page full of jobs
        // already collected by earlier keywords is normal and must not stop
        // the scan.
        if (newForTerm === 0) {
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

  parseListings(html: string, baseUrl = JUSTJOINIT_ROOT): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();
    const partialFailures = new Map<string, { url: string; error: Error }>();

    $('a[href*="/job-offer/"]').each((_, element) => {
      const href = $(element).attr("href");
      if (!href) {
        return;
      }

      const url = normalizeUrl(href, baseUrl);
      const externalId = `${this.source}:${new URL(url).pathname}`;

      // If we already successfully parsed this job from a previous element, skip
      if (offers.has(externalId)) {
        return;
      }

      const parent = $(element).parent();
      const textNodes = extractLeafTexts($, parent);

      const titleAttr = $(element).attr("title") || "";
      const title =
        cheerio
          .load(titleAttr)
          .text()
          .replace(/^View offer\s+/i, "")
          .trim() || undefined;

      if (textNodes.length < 3 && !title) return;

      let salaryText: string | undefined;
      let company: string | undefined;
      let location: string | undefined;

      for (let i = 0; i < textNodes.length; i++) {
        const val = textNodes[i];

        if (!salaryText && isSalaryText(val)) {
          const combined =
            i > 0 && /^[\d\s,-]+$/.test(textNodes[i - 1]) ? textNodes[i - 1] + " " + val : val;
          if (!/Undisclosed/i.test(combined)) {
            salaryText = combined;
          }
          continue;
        }

        if (
          !company &&
          !isIgnorableText(val) &&
          val !== title &&
          !isSalaryText(val) &&
          !/^\d/.test(val)
        ) {
          company = val;
          continue;
        }

        if (
          company &&
          !location &&
          !isIgnorableText(val) &&
          val !== title &&
          val !== company &&
          !isSalaryText(val) &&
          !/^\d/.test(val)
        ) {
          location = val;
          break;
        }
      }

      if (!title || !company) {
        // We log partial extraction failure if we have a URL but missing core text
        if (title || company) {
          partialFailures.set(externalId, {
            url,
            error: new Error("Missing required title or company from DOM")
          });
        }
        return;
      }

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
        // If successfully parsed, remove any previously logged failure for this ID
        partialFailures.delete(externalId);
      } else {
        partialFailures.set(externalId, { url, error: result.error });
      }
    });

    // Log validation failures ONLY for URLs that failed entirely across all matches
    for (const [externalId, failure] of partialFailures.entries()) {
      if (!offers.has(externalId)) {
        Telemetry.recordScrapeValidationFailure(this.source, failure.url, failure.error);
      }
    }

    return [...offers.values()];
  }
}
