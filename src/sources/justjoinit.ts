import * as cheerio from "cheerio";

import type {
  JobListing,
  JustJoinItSearchFilters,
  SourceConfig
} from "../types.js";
import type { SourceAdapter } from "./types.js";

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
  element: unknown
): string[] {
  const texts = $(element as any)
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

  buildSearchUrl(
    filters: JustJoinItSearchFilters,
    baseUrl = JUSTJOINIT_ROOT
  ): string {
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

    return url.toString();
  }

  async discoverListings(
    config: SourceConfig<JustJoinItSearchFilters>,
    fetchHtml: (url: string) => Promise<string>
  ): Promise<JobListing[]> {
    const html = await fetchHtml(
      this.buildSearchUrl(config.filters, config.baseUrl)
    );

    return this.parseListings(html, config.baseUrl).slice(0, config.maxListings);
  }

  parseListings(html: string, baseUrl = JUSTJOINIT_ROOT): JobListing[] {
    const $ = cheerio.load(html);
    const offers = new Map<string, JobListing>();

    $("a[href*=\"/job-offer/\"]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) {
        return;
      }

      const url = normalizeUrl(href, baseUrl);
      const externalId = `${this.source}:${new URL(url).pathname}`;
      const textNodes = extractLeafTexts($, element);
      const titleIndex = textNodes.findIndex(
        (value) => !isIgnorableText(value) && !isSalaryText(value)
      );
      const title = titleIndex >= 0 ? textNodes[titleIndex] : undefined;

      let salaryText: string | undefined;
      let company: string | undefined;
      let location: string | undefined;

      for (const value of textNodes.slice(titleIndex + 1)) {
        if (!salaryText && isSalaryText(value)) {
          salaryText = /Undisclosed Salary/i.test(value) ? undefined : value;
          continue;
        }

        if (!company && !isIgnorableText(value) && !isSalaryText(value)) {
          company = value;
          continue;
        }

        if (company && !location && !isIgnorableText(value) && !isSalaryText(value)) {
          location = value;
          break;
        }
      }

      if (!title || !company) {
        return;
      }

      offers.set(externalId, {
        externalId,
        source: this.source,
        url,
        title,
        company,
        salaryText,
        location
      });
    });

    return [...offers.values()];
  }
}
