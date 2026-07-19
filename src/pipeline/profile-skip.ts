import type { JobStatus } from "@core/types";
import { BOTH_PROFILE } from "@storage/profile-merge";

/**
 * Whether a job already terminal for the active profile should be skipped.
 * - same profile or "both" → skip
 * - other profile only → re-score
 * - legacy null profile → treat as software-era (skip software, allow other profiles)
 */
export function shouldSkipJobForProfile(
  status: JobStatus | undefined,
  existingProfile: string | null | undefined,
  profileId: string
): boolean {
  if (status !== "matched" && status !== "rejected") {
    return false;
  }

  if (existingProfile === BOTH_PROFILE) {
    return true;
  }

  if (existingProfile == null || existingProfile === "") {
    return profileId === "software";
  }

  return existingProfile === profileId;
}
