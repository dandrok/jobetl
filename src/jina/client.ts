export class JinaReaderClient {
  constructor(private readonly apiKey: string) {}

  async fetchMarkdown(url: string): Promise<string> {
    const response = await fetch(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "text/plain"
      }
    });

    if (!response.ok) {
      throw new Error(`Jina Reader request failed with ${response.status}`);
    }

    return response.text();
  }
}
