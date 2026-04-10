import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";

import type { JobOffer, MatchResult } from "../types.js";

const matchSchema = z.object({
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  summary: z.string().min(1)
});

export class DeepSeekMatcher {
  private readonly provider;

  constructor(apiKey: string) {
    this.provider = createDeepSeek({ apiKey });
  }

  async scoreOffer(job: JobOffer, resumeMarkdown: string): Promise<MatchResult> {
    const result = await generateObject({
      model: this.provider("deepseek-chat"),
      schema: matchSchema,
      prompt: [
        "You are scoring how well a job offer matches a software engineer CV.",
        "Return a score between 0 and 1, a short reason, and a short summary.",
        "Prefer backend, ETL, Node.js, TypeScript, automation, and data-related overlap when present.",
        "",
        "CV MARKDOWN:",
        resumeMarkdown,
        "",
        "JOB OFFER MARKDOWN:",
        job.offerMarkdown
      ].join("\n")
    });

    return {
      ...result.object,
      shouldSave: true
    };
  }
}
