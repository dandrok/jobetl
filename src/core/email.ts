import type { MatchCandidate, RuntimeEnv } from "./types";

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

/**
 * Compiles a list of matched jobs into a highly compatible, styled HTML template for email clients.
 */
function compileHtmlTemplate(jobs: MatchCandidate[]): string {
  const jobCards = jobs
    .map((candidate) => {
      const { job, match } = candidate;
      const scorePct = Math.round(match.score * 100);

      // Determine badge color based on match score
      let badgeBg = "#fef3c7";
      let badgeColor = "#92400e";
      if (match.score >= 0.85) {
        badgeBg = "#dcfce7";
        badgeColor = "#15803d";
      }

      // Escape all dynamic text inputs
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
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: top;">
                <h2 style="margin: 0 0 6px 0; font-size: 18px; color: #111827; font-weight: 700; line-height: 1.3;">
                  ${titleEscaped}
                </h2>
                <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                  🏢 ${companyEscaped} <span style="color: #d1d5db; margin: 0 4px;">|</span> 🌐 ${sourceEscaped}
                </div>
                ${salaryHtml}
                ${locationHtml}
              </td>
              <td style="vertical-align: top; text-align: right; width: 80px;">
                <span style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; background-color: ${badgeBg}; color: ${badgeColor}; white-space: nowrap;">
                  ${scorePct}% Match
                </span>
              </td>
            </tr>
          </table>
          
          ${reasonHtml}

          <div style="margin-top: 16px;">
            <a href="${sanitizeUrl(job.url)}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
              View Offer &rarr;
            </a>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>New Job Matches</title>
      </head>
      <body style="background-color: #f3f4f6; margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto;">
          <div style="padding: 24px 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; color: #1f2937; font-weight: 800; letter-spacing: -0.025em;">
              🔥 JobETL New Matches
            </h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">
              We found ${jobs.length} new matching offer${jobs.length > 1 ? "s" : ""} for your profile.
            </p>
          </div>
          
          ${jobCards}
          
          <div style="padding: 20px 0; text-align: center; border-top: 1px solid #e5e7eb; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
              Sent automatically by your JobETL Pipeline.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Sends a newsletter of matched jobs using Resend API.
 */
export async function sendNewsletter(jobs: MatchCandidate[], env: RuntimeEnv): Promise<boolean> {
  if (jobs.length === 0) {
    return true;
  }

  const { resendApiKey, senderEmail, recipientEmail } = env;

  if (!resendApiKey || !senderEmail || !recipientEmail) {
    console.warn(
      "Skipping email alert: RESEND_API_KEY, SENDER_EMAIL, or RECIPIENT_EMAIL environment variables are missing."
    );
    return false;
  }

  const subject = `🔥 JobETL: ${jobs.length} New Job Match${jobs.length > 1 ? "es" : ""} Found!`;
  const htmlContent = compileHtmlTemplate(jobs);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

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

    console.log(`Successfully sent email alert with ${jobs.length} matches to ${recipientEmail}`);
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
