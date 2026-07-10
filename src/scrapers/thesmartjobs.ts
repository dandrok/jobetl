import type { JobListing, TheSmartJobsSearchFilters, SourceConfig } from "@core/types";
import { JobListingSchema } from "@core/types";
import { Telemetry } from "@core/telemetry";
import type { SourceAdapter } from "@scrapers/types";

export class TheSmartJobsAdapter implements SourceAdapter<"thesmartjobs"> {
  readonly source = "thesmartjobs" as const;

  buildSearchUrl(filters: TheSmartJobsSearchFilters, baseUrl: string, page = 1): string {
    const url = new URL("/api/jobs/search", baseUrl);
    if (filters.category) {
      url.searchParams.set("categories", filters.category);
    }
    if (filters.sort) {
      url.searchParams.set("sort", filters.sort);
    }
    url.searchParams.set("locale", "pl");
    url.searchParams.set("page", String(page));
    return url.toString();
  }

  parseListings(
    jsonText: string,
    baseUrl: string
  ): { listings: JobListing[]; totalPages: number; pageSize: number } {
    try {
      const payload = JSON.parse(jsonText);

      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray(payload.data) ||
        (payload.meta !== undefined && (payload.meta === null || typeof payload.meta !== "object"))
      ) {
        Telemetry.recordScrapeValidationFailure(
          this.source,
          baseUrl,
          new Error("Invalid response envelope structure from thesmartjobs API")
        );
        return { listings: [], totalPages: 0, pageSize: 20 };
      }

      const jobs = payload.data;
      const meta = payload.meta || {};

      const rawTotalPages = meta.totalPages;
      if (rawTotalPages !== undefined && (!Number.isInteger(rawTotalPages) || rawTotalPages < 0)) {
        Telemetry.recordScrapeValidationFailure(
          this.source,
          baseUrl,
          new Error("Invalid totalPages count in thesmartjobs API response")
        );
        return { listings: [], totalPages: 0, pageSize: 20 };
      }

      const totalPages = typeof rawTotalPages === "number" ? rawTotalPages : 1;
      const pageSize = typeof meta.limit === "number" ? meta.limit : 20;

      const listings: JobListing[] = [];

      for (const job of jobs) {
        try {
          if (!job.id || !job.title) {
            Telemetry.recordScrapeValidationFailure(
              this.source,
              baseUrl,
              new Error("Missing required job id or title from JSON payload")
            );
            continue;
          }

          const externalId = `${this.source}:${job.id}`;

          let relativeUrl = job.slugUrl;
          if (!relativeUrl && job.slug) {
            relativeUrl = `jobs/${job.slug}`;
          }
          if (!relativeUrl) {
            Telemetry.recordScrapeValidationFailure(
              this.source,
              baseUrl,
              new Error(`No slugUrl or slug found for job id: ${job.id}`)
            );
            continue;
          }

          const url = new URL(relativeUrl, new URL("/pl/", baseUrl)).toString();

          const company =
            (typeof job.company === "string" ? job.company : job.company?.name) ||
            "Unknown Company";

          let salaryText: string | undefined = undefined;
          if (job.salaries && job.salaries.length > 0) {
            const sal = job.salaries[0];
            if (sal.min !== undefined && sal.max !== undefined) {
              salaryText = `${sal.min} - ${sal.max} ${sal.currency || "PLN"} / ${sal.period || "mies."} (${sal.contractType || ""})`;
            } else if (sal.min !== undefined) {
              salaryText = `${sal.min} ${sal.currency || "PLN"} / ${sal.period || "mies."} (${sal.contractType || ""})`;
            }
          }

          let location: string | undefined = undefined;
          if (job.locations && job.locations.length > 0) {
            location = job.locations[0].city;
          }

          const rawOffer = {
            externalId,
            source: this.source,
            url,
            title: job.title,
            company,
            salaryText: salaryText || undefined,
            location: location || undefined
          };

          const result = JobListingSchema.safeParse(rawOffer);
          if (result.success) {
            listings.push(result.data);
          } else {
            Telemetry.recordScrapeValidationFailure(this.source, url, result.error);
          }
        } catch (jobError) {
          Telemetry.recordScrapeValidationFailure(
            this.source,
            baseUrl,
            jobError instanceof Error ? jobError : new Error(String(jobError))
          );
        }
      }

      return { listings, totalPages, pageSize };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      Telemetry.recordScrapeValidationFailure(this.source, baseUrl, err);
      return { listings: [], totalPages: 0, pageSize: 20 };
    }
  }

  async discoverListings(
    config: SourceConfig<TheSmartJobsSearchFilters>,
    fetchHtml: (url: string, init?: RequestInit) => Promise<string>
  ): Promise<JobListing[]> {
    const offers: JobListing[] = [];

    // Phase 1: Fetch page 1 to get baseline listings and the total page count
    const firstPageUrl = this.buildSearchUrl(config.filters, config.baseUrl, 1);
    let totalPages: number;
    let pageSize: number;
    try {
      const jsonText = await fetchHtml(firstPageUrl, {
        headers: { Accept: "application/json" }
      });
      const result = this.parseListings(jsonText, config.baseUrl);
      offers.push(...result.listings);
      totalPages = result.totalPages;
      pageSize = result.pageSize;
    } catch (e) {
      Telemetry.recordScrapeValidationFailure(
        this.source,
        firstPageUrl,
        e instanceof Error ? e : new Error(String(e))
      );
      Telemetry.recordScrapeZeroYield(this.source, config.baseUrl);
      return [];
    }

    // Phase 2: Fetch remaining pages up to maxListings in parallel
    const neededListings = config.maxListings - offers.length;
    if (neededListings > 0 && totalPages > 1) {
      const additionalPagesNeeded = Math.min(Math.ceil(neededListings / pageSize), totalPages - 1);

      const pageUrls: string[] = [];
      const pagePromises: Promise<string>[] = [];

      for (let i = 0; i < additionalPagesNeeded; i++) {
        const pageNum = i + 2;
        const targetUrl = this.buildSearchUrl(config.filters, config.baseUrl, pageNum);
        pageUrls.push(targetUrl);
        pagePromises.push(
          fetchHtml(targetUrl, {
            headers: { Accept: "application/json" }
          })
        );
      }

      const results = await Promise.allSettled(pagePromises);
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const targetUrl = pageUrls[i];
        if (res.status === "fulfilled") {
          const result = this.parseListings(res.value, config.baseUrl);
          offers.push(...result.listings);
        } else {
          Telemetry.recordScrapeValidationFailure(
            this.source,
            targetUrl,
            res.reason instanceof Error ? res.reason : new Error(String(res.reason))
          );
        }
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
