import type { MatchCandidate } from "../types.js";

export function selectMatches(
  candidates: MatchCandidate[],
  threshold: number
): MatchCandidate[] {
  return candidates.filter(
    (candidate) => candidate.match.shouldSave && candidate.match.score >= threshold
  );
}
