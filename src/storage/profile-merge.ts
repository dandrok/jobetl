import type { JobStatus, MatchCandidate } from "@core/types";

export const BOTH_PROFILE = "both";

export interface ExistingScoreState {
  profile?: string | null;
  status?: JobStatus;
  matchScore?: number | null;
  matchReason?: string | null;
  summary?: string | null;
}

export interface MergedScoreState {
  profile: string | null;
  status: "matched" | "rejected";
  matchScore: number;
  matchReason: string;
  summary: string;
}

function isTerminalMatch(status: JobStatus | undefined): boolean {
  return status === "matched";
}

/**
 * Merge a new profile score into an existing job row.
 * - Matching both distinct profiles → profile "both", keep the higher score fields.
 * - Reject must not clobber an existing match from another profile.
 */
export function mergeScoredJobState(
  existing: ExistingScoreState | undefined,
  candidate: MatchCandidate,
  incomingProfile: string
): MergedScoreState {
  const incomingScore = candidate.match.score;
  const incomingReason = candidate.match.reason;
  const incomingSummary = candidate.match.summary;
  const matched = candidate.match.shouldSave;

  const existingProfile = existing?.profile ?? null;
  const existingScore = existing?.matchScore ?? null;
  const existingReason = existing?.matchReason ?? null;
  const existingSummary = existing?.summary ?? null;
  const existingStatus = existing?.status;

  if (!matched) {
    // Do not overwrite a prior match from another lane (including legacy null profile).
    if (isTerminalMatch(existingStatus) && existingProfile !== incomingProfile) {
      return {
        profile: existingProfile,
        status: "matched",
        matchScore: existingScore ?? incomingScore,
        matchReason: existingReason ?? incomingReason,
        summary: existingSummary ?? incomingSummary
      };
    }

    return {
      profile: incomingProfile,
      status: "rejected",
      matchScore: incomingScore,
      matchReason: incomingReason,
      summary: incomingSummary
    };
  }

  // Incoming is a match
  if (!existingProfile || existingProfile === incomingProfile) {
    return {
      profile: incomingProfile,
      status: "matched",
      matchScore: incomingScore,
      matchReason: incomingReason,
      summary: incomingSummary
    };
  }

  if (existingProfile === BOTH_PROFILE) {
    const useIncoming = existingScore == null || incomingScore >= existingScore;
    return {
      profile: BOTH_PROFILE,
      status: "matched",
      matchScore: useIncoming ? incomingScore : (existingScore as number),
      matchReason: useIncoming ? incomingReason : (existingReason ?? incomingReason),
      summary: useIncoming ? incomingSummary : (existingSummary ?? incomingSummary)
    };
  }

  // Different single profile already set
  if (isTerminalMatch(existingStatus)) {
    const useIncoming = existingScore == null || incomingScore >= existingScore;
    return {
      profile: BOTH_PROFILE,
      status: "matched",
      matchScore: useIncoming ? incomingScore : (existingScore as number),
      matchReason: useIncoming
        ? `${incomingReason} (also matched profile "${existingProfile}")`
        : `${existingReason ?? incomingReason} (also matched profile "${incomingProfile}")`,
      summary: useIncoming ? incomingSummary : (existingSummary ?? incomingSummary)
    };
  }

  // Prior profile only rejected (or non-matched) — take the new match
  return {
    profile: incomingProfile,
    status: "matched",
    matchScore: incomingScore,
    matchReason: incomingReason,
    summary: incomingSummary
  };
}
