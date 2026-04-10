import type { MatchCandidate } from "../types.js";

export function buildNotionJobPage(
  databaseId: string,
  candidate: MatchCandidate,
  savedAt: Date
) {
  return {
    parent: {
      database_id: databaseId
    },
    properties: {
      "Job Title": {
        title: [
          {
            text: {
              content: candidate.job.title
            }
          }
        ]
      },
      Company: {
        rich_text: [
          {
            text: {
              content: candidate.job.company
            }
          }
        ]
      },
      Salary: {
        rich_text: [
          {
            text: {
              content: candidate.job.salaryText ?? ""
            }
          }
        ]
      },
      Summary: {
        rich_text: [
          {
            text: {
              content: candidate.match.summary
            }
          }
        ]
      },
      "Offer URL": {
        url: candidate.job.url
      },
      Source: {
        select: {
          name: candidate.job.source
        }
      },
      "Match Score": {
        number: candidate.match.score
      },
      "Match Reason": {
        rich_text: [
          {
            text: {
              content: candidate.match.reason
            }
          }
        ]
      },
      "Saved At": {
        date: {
          start: savedAt.toISOString()
        }
      },
      "External ID": {
        rich_text: [
          {
            text: {
              content: candidate.job.externalId
            }
          }
        ]
      }
    }
  };
}
