import * as cheerio from "cheerio";

export class JinaReaderClient {
  private useApiKey = true;
  private validationPromise: Promise<void> | null = null;
  private keylessLock: Promise<void> = Promise.resolve();

  constructor(private readonly apiKey: string) {
    this.useApiKey = !!apiKey;
  }

  private async validateKey(): Promise<void> {
    if (!this.useApiKey || !this.apiKey) {
      return;
    }
    if (this.validationPromise) {
      return this.validationPromise;
    }

    this.validationPromise = (async () => {
      try {
        const response = await fetch("https://r.jina.ai/http://example.com", {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "text/plain"
          }
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 402 || response.status === 403) {
            console.warn(
              `\n[JINA] API key issue (status ${response.status}). Disabling API key for this run and falling back to keyless free tier.`
            );
            this.useApiKey = false;
          }
        }
      } catch {
        // Ignore check failures, fallback fetch will handle actual fetch failures
      }
    })();

    return this.validationPromise;
  }

  async fetchMarkdown(url: string): Promise<string> {
    try {
      return await this.fetchWithJina(url);
    } catch (error) {
      console.warn(
        `\n[JINA] Jina Reader failed for ${url} (${error instanceof Error ? error.message : String(error)}). Falling back to direct HTML text parser...`
      );
      return await this.fetchDirectHtmlAsText(url);
    }
  }

  private async fetchWithJina(url: string): Promise<string> {
    await this.validateKey();

    const cleanUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;

    if (this.useApiKey) {
      try {
        const response = await fetch(cleanUrl, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "text/plain"
          }
        });

        if (response.ok) {
          return await response.text();
        }

        if (response.status === 401 || response.status === 402 || response.status === 403) {
          this.useApiKey = false;
        } else {
          throw new Error(`Jina Reader request failed with ${response.status}`);
        }
      } catch (error) {
        if (error instanceof Error && !error.message.includes("Jina Reader request failed")) {
          // Network errors or other exceptions, retry keyless
        } else if (error instanceof Error && error.message.includes("Jina Reader request failed")) {
          throw error;
        }
      }
    }

    return new Promise<string>((resolve, reject) => {
      this.keylessLock = this.keylessLock.then(async () => {
        try {
          const content = await this.fetchKeylessWithRetry(cleanUrl);
          resolve(content);
        } catch (error) {
          reject(error);
        } finally {
          await new Promise((r) => setTimeout(r, 1000));
        }
      });
    });
  }

  private async fetchKeylessWithRetry(url: string, attempt = 1): Promise<string> {
    const response = await fetch(url, {
      headers: {
        Accept: "text/plain"
      }
    });

    if (response.status === 429) {
      if (attempt <= 2) {
        const delay = attempt * 2000;
        console.warn(
          `\n[JINA] Keyless rate limit (429) hit. Retrying in ${delay / 1000}s (attempt ${attempt}/2)...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchKeylessWithRetry(url, attempt + 1);
      }
      throw new Error("Jina Reader keyless rate limit (429) hit.");
    }

    if (!response.ok) {
      throw new Error(`Jina Reader keyless request failed with ${response.status}`);
    }

    return response.text();
  }

  private async fetchDirectHtmlAsText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`Direct HTML fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Strip non-content elements to make it cleaner for LLM matching
    $("script, style, nav, footer, header, iframe, noscript, svg, path, button").remove();

    const bodyText = $("body").text();
    const cleaned = bodyText.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();

    if (!cleaned) {
      throw new Error("Direct HTML parsed text is empty");
    }

    return cleaned;
  }
}
