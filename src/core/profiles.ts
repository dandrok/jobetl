import type { ProfileId, ProfileRunConfig, RunConfig } from "@core/types";

export function listProfileIds(config: RunConfig): ProfileId[] {
  return Object.keys(config.profiles);
}

export function listEnabledProfileIds(config: RunConfig): ProfileId[] {
  return listProfileIds(config).filter((id) => config.profiles[id]?.enabled);
}

export function buildProfileRunConfig(config: RunConfig, profileId: ProfileId): ProfileRunConfig {
  const profile = config.profiles[profileId];

  if (!profile) {
    const known = listProfileIds(config).join(", ") || "(none)";
    throw new Error(`Unknown profile "${profileId}". Expected one of: ${known}`);
  }

  if (!profile.enabled) {
    throw new Error(`Profile "${profileId}" is disabled in config`);
  }

  return {
    profileId,
    databaseUrl: config.databaseUrl,
    fetchConcurrency: config.fetchConcurrency,
    scoreConcurrency: config.scoreConcurrency,
    resumeMarkdownPath: profile.resumeMarkdownPath,
    matchThreshold: profile.matchThreshold,
    sources: profile.sources,
    emailSubjectPrefix: profile.emailSubjectPrefix
  };
}

/**
 * Resolve which profiles to run: explicit CLI id, or all enabled profiles.
 */
export function resolveProfilesToRun(config: RunConfig, profileId?: ProfileId): ProfileId[] {
  if (profileId) {
    // Validate enabled + exists
    buildProfileRunConfig(config, profileId);
    return [profileId];
  }

  const enabled = listEnabledProfileIds(config);
  if (enabled.length === 0) {
    throw new Error("No enabled profiles in config");
  }

  return enabled;
}
