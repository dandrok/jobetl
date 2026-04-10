import { Client } from "@notionhq/client";

import { buildNotionJobPage } from "./build-job-page.js";
import type { MatchCandidate } from "../types.js";

export class NotionJobRepository {
  private readonly client: Client;

  constructor(auth: string) {
    this.client = new Client({ auth });
  }

  async hasExternalId(databaseId: string, externalId: string): Promise<boolean> {
    const response = await this.client.dataSources.query({
      data_source_id: databaseId,
      filter: {
        property: "External ID",
        rich_text: {
          equals: externalId
        }
      },
      page_size: 1
    });

    return response.results.length > 0;
  }

  async createJob(databaseId: string, candidate: MatchCandidate): Promise<void> {
    await this.client.pages.create(
      buildNotionJobPage(databaseId, candidate, new Date())
    );
  }
}
