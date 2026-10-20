import type { MatchCandidate, RuntimeEnv } from "./types";
import type { RunSummary } from "@pipeline/run";
import type { SourceCheckResult } from "@pipeline/check-sources";

export interface ProfileReport {
  profileId: string;
  summary: RunSummary;
}

export interface SendNewsletterOptions {
  /** When set, used as prefix in subject: e.g. `${subjectPrefix}: ...` */
  subjectPrefix?: string;
}

/**
 * Escapes dynamic text inputs to prevent HTML injection.
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>'"]/g, (tag) => {
    const chars: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return chars[tag] || tag;
  });
}

/**
 * Validates and sanitizes job URL before placing it into the template.
 */
function sanitizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeHtml(parsed.href);
    }
  } catch {
    // ignore
  }
  return "#";
}

function renderJobCard(candidate: MatchCandidate): string {
  const { job, match } = candidate;
  const scorePct = Math.round(match.score * 100);

  let badgeBg = "#fef3c7";
  let badgeColor = "#92400e";
  if (match.score >= 0.85) {
    badgeBg = "#dcfce7";
    badgeColor = "#15803d";
  }

  const titleEscaped = escapeHtml(job.title);
  const companyEscaped = escapeHtml(job.company);
  const sourceEscaped = escapeHtml(job.source);
  const salaryEscaped = job.salaryText ? escapeHtml(job.salaryText) : "";
  const locationEscaped = job.location ? escapeHtml(job.location) : "";
  const reasonEscaped = match.reason ? escapeHtml(match.reason) : "";

  const salaryHtml = salaryEscaped
    ? `<div style="font-size: 14px; color: #059669; font-weight: 600; margin-top: 4px;">💰 ${salaryEscaped}</div>`
    : "";

  const locationHtml = locationEscaped
    ? `<div style="font-size: 13px; color: #6b7280; margin-top: 4px;">📍 ${locationEscaped}</div>`
    : "";

  const reasonHtml = reasonEscaped
    ? `<div style="margin-top: 12px; padding: 10px; background-color: #f9fafb; border-left: 3px solid #e5e7eb; font-size: 13px; color: #4b5563; line-height: 1.5; font-style: italic;">
         ${reasonEscaped}
       </div>`
    : "";

  return `
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top;">
            <h3 style="margin: 0 0 6px 0; font-size: 17px; color: #111827; font-weight: 700; line-height: 1.3;">
              ${titleEscaped}
            </h3>
            <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
              🏢 ${companyEscaped} <span style="color: #d1d5db; margin: 0 4px;">|</span> 🌐 ${sourceEscaped}
            </div>
            ${salaryHtml}
            ${locationHtml}
          </td>
          <td style="vertical-align: top; text-align: right; width: 85px;">
            <span style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; background-color: ${badgeBg}; color: ${badgeColor}; white-space: nowrap;">
              ${scorePct}% Match
            </span>
          </td>
        </tr>
      </table>
      
      ${reasonHtml}

      <div style="margin-top: 14px;">
        <a href="${sanitizeUrl(job.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
          View Offer &rarr;
        </a>
      </div>
    </div>
  `;
}

function renderHealthSection(profiles: ProfileReport[]): string {
  const profileTables = profiles
    .map((profile) => {
      const reports: SourceCheckResult[] = profile.summary.sourceReports ?? [];
      if (reports.length === 0) return "";

      const rows = reports
        .map((r) => {
          const statusIcon =
            r.status === "ok"
              ? "🟢"
              : r.status === "degraded"
                ? "🟡"
                : r.status === "error"
                  ? "🔴"
                  : "⏭️";
          const statusText =
            r.status === "ok"
              ? "Healthy"
              : r.status === "degraded"
                ? "Degraded"
                : r.status === "error"
                  ? "Failed"
                  : "Skipped";

          const latencyStr = r.latencyMs > 0 ? `${r.latencyMs}ms` : "—";
          const listingsStr = r.status === "skipped" ? "—" : String(r.listings);

          return `
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 6px 8px; font-weight: 600; color: #374151;">${escapeHtml(r.source)}</td>
              <td style="padding: 6px 8px; white-space: nowrap;">${statusIcon} ${statusText}</td>
              <td style="padding: 6px 8px; color: #4b5563;">${listingsStr}</td>
              <td style="padding: 6px 8px; color: #6b7280;">${latencyStr}</td>
            </tr>
          `;
        })
        .join("");

      const problems = reports.filter((r) => r.status === "degraded" || r.status === "error");
      const problemNotes = problems
        .map((p) => {
          const detail =
            p.status === "degraded"
              ? p.validationFailures > 0
                ? `Yielded 0 listings (${p.validationFailures} validation failures) — DOM structure likely changed.`
                : `Yielded 0 listings — DOM container selector likely changed or site returned no offers.`
              : `Discovery failed: ${p.error ?? "unknown error"}`;
          return `
            <div style="font-size: 12px; color: #991b1b; background-color: #fef2f2; border-left: 3px solid #ef4444; padding: 6px 10px; margin-top: 6px; border-radius: 4px;">
              <strong>${escapeHtml(p.source)}:</strong> ${escapeHtml(detail)}
            </div>
          `;
        })
        .join("");

      return `
        <div style="margin-top: 12px; margin-bottom: 16px;">
          <div style="font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
            Profile: ${escapeHtml(profile.profileId)}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f3f4f6; color: #6b7280; text-align: left; font-size: 11px; text-transform: uppercase;">
                <th style="padding: 6px 8px;">Source</th>
                <th style="padding: 6px 8px;">Status</th>
                <th style="padding: 6px 8px;">Listings</th>
                <th style="padding: 6px 8px;">Latency</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          ${problemNotes}
        </div>
      `;
    })
    .join("");

  return `
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-top: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <h3 style="margin: 0 0 4px 0; font-size: 15px; color: #111827; font-weight: 700;">
        📡 Scraper Health Monitor
      </h3>
      <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280;">
        Real-time status of job source adapters during this execution.
      </p>
      ${profileTables}
    </div>
  `;
}

function compileCombinedHtmlTemplate(profiles: ProfileReport[]): string {
  const totalMatches = profiles.reduce((sum, p) => sum + p.summary.matchedCandidates.length, 0);
  const allReports = profiles.flatMap((p) => p.summary.sourceReports ?? []);
  const hasProblems = allReports.some((r) => r.status === "degraded" || r.status === "error");

  let warningBanner = "";
  if (hasProblems) {
    warningBanner = `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; color: #991b1b; font-size: 13px;">
        <strong>⚠️ Scraper Degradation Warning:</strong> One or more sources encountered errors or 0 listings. Check the Health Monitor below for details.
      </div>
    `;
  }

  const contentHtml =
    totalMatches === 0
      ? `
      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 28px 20px; text-align: center; margin-bottom: 20px;">
        <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
        <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #111827; font-weight: 700;">
          No New Matching Roles Found
        </h3>
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5; max-width: 440px; margin: 0 auto;">
          All scanned jobs were evaluated against your CV match brief, but none exceeded the threshold in this run. Upstream ingestion health is detailed below.
        </p>
      </div>
    `
      : profiles
          .filter((p) => p.summary.matchedCandidates.length > 0)
          .map((p) => {
            const cards = p.summary.matchedCandidates.map(renderJobCard).join("");
            return `
          <div style="margin-bottom: 24px;">
            <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px;">
              <span style="font-size: 14px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">
                🎯 Profile: ${escapeHtml(p.profileId)} (${p.summary.matchedCandidates.length})
              </span>
            </div>
            ${cards}
          </div>
        `;
          })
          .join("");

  const healthHtml = renderHealthSection(profiles);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>JobETL Digest</title>
      </head>
      <body style="background-color: #f3f4f6; margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 620px; margin: 0 auto;">
          <div style="padding: 20px 0; text-align: center;">
            <h1 style="margin: 0; font-size: 22px; color: #1f2937; font-weight: 800; letter-spacing: -0.025em;">
              🔥 JobETL Daily Digest
            </h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">
              ${totalMatches} new matching offer${totalMatches === 1 ? "" : "s"} across ${profiles.length} profile${profiles.length === 1 ? "" : "s"}.
            </p>
          </div>

          ${warningBanner}
          ${contentHtml}
          ${healthHtml}

          <div style="padding: 20px 0; text-align: center; border-top: 1px solid #e5e7eb; margin-top: 24px;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
              Sent automatically by your JobETL Pipeline.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildCombinedSubject(profiles: ProfileReport[], prefix: string): string {
  const totalMatches = profiles.reduce((sum, p) => sum + p.summary.matchedCandidates.length, 0);
  const allReports = profiles.flatMap((p) => p.summary.sourceReports ?? []);
  const hasProblem = allReports.some((r) => r.status === "degraded" || r.status === "error");

  if (totalMatches > 0) {
    const profileCounts = profiles
      .filter((p) => p.summary.matchedCandidates.length > 0)
      .map((p) => `${p.profileId}: ${p.summary.matchedCandidates.length}`)
      .join(", ");
    const alertTag = hasProblem ? " [⚠️ source warning]" : "";
    return `🔥 ${prefix}: ${totalMatches} New Match${totalMatches > 1 ? "es" : ""} (${profileCounts})${alertTag}`;
  }

  if (hasProblem) {
    return `⚠️ ${prefix}: Digest (0 matches, scraper degradation detected)`;
  }

  return `📋 ${prefix}: Daily Digest (0 matches, all sources healthy)`;
}

/**
 * Sends a single combined newsletter covering all profiles and scraper health status.
 */
export async function sendCombinedNewsletter(
  profiles: ProfileReport[],
  env: RuntimeEnv,
  options: SendNewsletterOptions = {}
): Promise<boolean> {
  const { resendApiKey, senderEmail, recipientEmail } = env;

  if (!resendApiKey || !senderEmail || !recipientEmail) {
    console.warn(
      "Skipping email alert: RESEND_API_KEY, SENDER_EMAIL, or RECIPIENT_EMAIL environment variables are missing."
    );
    return false;
  }

  const prefix = options.subjectPrefix?.trim() || "JobETL";
  const subject = buildCombinedSubject(profiles, prefix);
  const htmlContent = compileCombinedHtmlTemplate(profiles);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [recipientEmail],
        subject: subject,
        html: htmlContent
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API returned status ${response.status}: ${errText}`);
    }

    const totalMatches = profiles.reduce((sum, p) => sum + p.summary.matchedCandidates.length, 0);
    console.log(
      `Successfully sent combined digest email (${totalMatches} matches across ${profiles.length} profiles).`
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Failed to send email alert: Resend API request timed out (10s)");
    } else {
      console.error(
        "Failed to send email alert:",
        error instanceof Error ? error.message : String(error)
      );
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Backward compatibility wrapper for single-profile dispatch or scripts.
 */
export async function sendNewsletter(
  jobs: MatchCandidate[],
  env: RuntimeEnv,
  options: SendNewsletterOptions = {}
): Promise<boolean> {
  if (jobs.length === 0) {
    return true;
  }

  return sendCombinedNewsletter(
    [
      {
        profileId: "default",
        summary: {
          scanned: jobs.length,
          skipped: 0,
          fetched: jobs.length,
          matched: jobs.length,
          rejected: 0,
          failed: 0,
          stored: jobs.length,
          matchedCandidates: jobs
        }
      }
    ],
    env,
    options
  );
}
