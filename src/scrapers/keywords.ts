export interface KeywordFilter {
  keyword?: string;
  keywords?: string[];
}

/**
 * Resolve the configured search terms for a source.
 *
 * `keywords` is the preferred config shape. `keyword` stays supported so old
 * configs (and callers building a single-term filter) keep working. Terms are
 * trimmed, empty entries dropped, and duplicates removed case-insensitively.
 */
export function resolveSearchKeywords(filters: KeywordFilter): string[] {
  const configured = filters.keywords?.length
    ? filters.keywords
    : filters.keyword
      ? [filters.keyword]
      : [];
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of configured) {
    const term = value.trim();
    const key = term.toLowerCase();

    if (!term || seen.has(key)) {
      continue;
    }

    seen.add(key);
    terms.push(term);
  }

  return terms;
}

/**
 * Split a source's total listing budget across its search terms.
 *
 * A single term keeps the full budget (backward compatible). With multiple
 * terms each one gets a fair share, so one broad term cannot starve the rest.
 */
export function listingsPerKeyword(maxListings: number, keywordCount: number): number {
  if (keywordCount <= 1) {
    return maxListings;
  }

  return Math.max(1, Math.ceil(maxListings / keywordCount));
}
