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
type GlobalWithAiSdk = typeof globalThis & { AI_SDK_LOG_WARNINGS?: boolean };
let prevWarnings: boolean | undefined;

export class DeepSeekMatcher {
  private readonly provider;

  constructor(apiKey: string) {
    this.provider = createDeepSeek({ apiKey });
  }

  async scoreOffer(job: JobOffer, resumeMarkdown: string): Promise<MatchResult> {
    if (activeScoreCalls === 0) {
      prevWarnings = (globalThis as GlobalWithAiSdk).AI_SDK_LOG_WARNINGS;
      (globalThis as GlobalWithAiSdk).AI_SDK_LOG_WARNINGS = false;
    }
    activeScoreCalls++;

    try {
      const result = await generateObject({
        model: this.provider("deepseek-v4-flash"),
        schema: matchSchema,
        prompt: [
          "You are scoring how well a job offer matches a candidate match brief.",
          "The document may be a hybrid: target roles / dealbreakers plus CV evidence,",
          "not only a classic resume. Respect hard nos and preferred titles when present.",
          "Return a score between 0 and 1, a short reason, and a short summary.",
          "",
          "MATCH BRIEF / CV MARKDOWN:",
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
        (globalThis as GlobalWithAiSdk).AI_SDK_LOG_WARNINGS = prevWarnings;
      }
    }
  }
}
