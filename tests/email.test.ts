import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { sendCombinedNewsletter, type ProfileReport } from "@core/email";
import type { MatchCandidate, RuntimeEnv } from "@core/types";

describe("sendCombinedNewsletter", () => {
  const mockEnv: RuntimeEnv = {
    jinaApiKey: "test-jina",
    deepseekApiKey: "test-deepseek",
    resendApiKey: "re_test_12345",
    senderEmail: "alerts@example.com",
    recipientEmail: "candidate@example.com"
  };

  const candidateA: MatchCandidate = {
    job: {
      externalId: "justjoinit:job-1",
      source: "justjoinit",
      url: "https://justjoin.it/offers/job-1",
      title: "Senior Node Engineer",
      company: "Acme Corp",
      salaryText: "25 000 PLN",
      location: "Warszawa"
    },
    match: {
      score: 0.92,
      reason: "Excellent TypeScript background",
      summary: "High match",
      shouldSave: true
    }
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("sends combined email with matches grouped by profile and health monitor footer", async () => {
    let capturedBody: { from: string; to: string[]; subject: string; html: string } | null = null;

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "email-123" }), { status: 200 });
    });

    const profiles: ProfileReport[] = [
      {
        profileId: "software",
        summary: {
          scanned: 10,
          skipped: 0,
          fetched: 1,
          matched: 1,
          rejected: 0,
          failed: 0,
          stored: 1,
          matchedCandidates: [candidateA],
          sourceReports: [
            {
              source: "justjoinit",
              status: "ok",
              listings: 50,
              latencyMs: 1200,
              validationFailures: 0
            },
            {
              source: "nofluffjobs",
              status: "ok",
              listings: 30,
              latencyMs: 800,
              validationFailures: 0
            }
          ]
        }
      },
      {
        profileId: "ai",
        summary: {
          scanned: 5,
          skipped: 0,
          fetched: 0,
          matched: 0,
          rejected: 0,
          failed: 0,
          stored: 0,
          matchedCandidates: [],
          sourceReports: [
            {
              source: "justjoinit",
              status: "ok",
              listings: 20,
              latencyMs: 900,
              validationFailures: 0
            },
            {
              source: "thesmartjobs",
              status: "skipped",
              listings: 0,
              latencyMs: 0,
              validationFailures: 0
            }
          ]
        }
      }
    ];

    const result = await sendCombinedNewsletter(profiles, mockEnv);

    expect(result).toBe(true);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody?.to).toEqual(["candidate@example.com"]);
    expect(capturedBody?.subject).toBe("🔥 JobETL: 1 New Match (software: 1)");
    expect(capturedBody?.html).toContain("Senior Node Engineer");
    expect(capturedBody?.html).toContain("Profile: software");
    expect(capturedBody?.html).toContain("Scraper Health Monitor");
    expect(capturedBody?.html).toContain("🟢 Healthy");
    expect(capturedBody?.html).toContain("⏭️ Skipped");
  });

  test("sends digest with empty state and healthy status when 0 matches exist", async () => {
    let capturedBody: { from: string; to: string[]; subject: string; html: string } | null = null;

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "email-empty" }), { status: 200 });
    });

    const profiles: ProfileReport[] = [
      {
        profileId: "software",
        summary: {
          scanned: 50,
          skipped: 45,
          fetched: 5,
          matched: 0,
          rejected: 5,
          failed: 0,
          stored: 50,
          matchedCandidates: [],
          sourceReports: [
            {
              source: "justjoinit",
              status: "ok",
              listings: 50,
              latencyMs: 1100,
              validationFailures: 0
            }
          ]
        }
      }
    ];

    const result = await sendCombinedNewsletter(profiles, mockEnv);

    expect(result).toBe(true);
    expect(capturedBody?.subject).toBe("📋 JobETL: Daily Digest (0 matches, all sources healthy)");
    expect(capturedBody?.html).toContain("No New Matching Roles Found");
    expect(capturedBody?.html).toContain("Scraper Health Monitor");
    expect(capturedBody?.html).not.toContain("Scraper Degradation Warning");
  });

  test("flags degraded sources in subject and top banner when a source yields 0 listings with validation errors", async () => {
    let capturedBody: { from: string; to: string[]; subject: string; html: string } | null = null;

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "email-warn" }), { status: 200 });
    });

    const profiles: ProfileReport[] = [
      {
        profileId: "software",
        summary: {
          scanned: 20,
          skipped: 0,
          fetched: 0,
          matched: 0,
          rejected: 0,
          failed: 0,
          stored: 0,
          matchedCandidates: [],
          sourceReports: [
            {
              source: "justjoinit",
              status: "ok",
              listings: 50,
              latencyMs: 1200,
              validationFailures: 0
            },
            {
              source: "nofluffjobs",
              status: "degraded",
              listings: 0,
              latencyMs: 700,
              validationFailures: 20
            }
          ]
        }
      }
    ];

    const result = await sendCombinedNewsletter(profiles, mockEnv);

    expect(result).toBe(true);
    expect(capturedBody?.subject).toBe(
      "⚠️ JobETL: Digest (0 matches, scraper degradation detected)"
    );
    expect(capturedBody?.html).toContain("Scraper Degradation Warning");
    expect(capturedBody?.html).toContain("🟡 Degraded");
    expect(capturedBody?.html).toContain("DOM structure likely changed");
  });

  test("flags degraded sources in subject and footer when a source yields 0 listings without validation errors", async () => {
    let capturedBody: { from: string; to: string[]; subject: string; html: string } | null = null;

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "email-warn-zero-yield" }), { status: 200 });
    });

    const profiles: ProfileReport[] = [
      {
        profileId: "software",
        summary: {
          scanned: 20,
          skipped: 0,
          fetched: 0,
          matched: 0,
          rejected: 0,
          failed: 0,
          stored: 0,
          matchedCandidates: [],
          sourceReports: [
            {
              source: "nofluffjobs",
              status: "degraded",
              listings: 0,
              latencyMs: 700,
              validationFailures: 0
            }
          ]
        }
      }
    ];

    const result = await sendCombinedNewsletter(profiles, mockEnv);

    expect(result).toBe(true);
    expect(capturedBody?.subject).toBe(
      "⚠️ JobETL: Digest (0 matches, scraper degradation detected)"
    );
    expect(capturedBody?.html).toContain("🟡 Degraded");
    expect(capturedBody?.html).toContain("DOM container selector likely changed");
  });
});
