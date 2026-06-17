import type { z } from "zod";

export const Telemetry = {
  recordScrapeValidationFailure(source: string, url: string, error: Error | z.ZodError) {
    let formatted = error.message;
    if ("issues" in error) {
      formatted = error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`).join(", ");
    }
    console.warn(`[TELEMETRY][VALIDATION_FAILURE][${source}] URL: ${url} | Errors: ${formatted}`);
  },

  recordScrapeZeroYield(source: string, url: string) {
    console.warn(
      `[TELEMETRY][ZERO_YIELD][${source}] The page yielded 0 listings. DOM structure may have changed. URL: ${url}`
    );
  }
};
