import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";

import type { JobOffer, MatchResult } from "../types.js";

// Suppress Vercel AI SDK compatibility warnings when deepseek injects JSON schema
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

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
      model: this.provider("deepseek-v4-flash"),
      schema: matchSchema,
      prompt: [
        "You are scoring how well a job offer matches a software engineer CV.",
        "Return a score between 0 and 1, a short reason, and a short summary.",
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
