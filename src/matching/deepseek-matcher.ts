import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";

import type { JobOffer, MatchResult } from "@core/types";

const matchSchema = z.object({
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  summary: z.string().min(1)
});

let activeScoreCalls = 0;
let prevWarnings: any;

export class DeepSeekMatcher {
  private readonly provider;

  constructor(apiKey: string) {
    this.provider = createDeepSeek({ apiKey });
  }

  async scoreOffer(job: JobOffer, resumeMarkdown: string): Promise<MatchResult> {
    if (activeScoreCalls === 0) {
      prevWarnings = (globalThis as any).AI_SDK_LOG_WARNINGS;
      (globalThis as any).AI_SDK_LOG_WARNINGS = false;
    }
    activeScoreCalls++;

    try {
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
    } finally {
      activeScoreCalls--;
      if (activeScoreCalls === 0) {
        (globalThis as any).AI_SDK_LOG_WARNINGS = prevWarnings;
      }
    }
  }
}
