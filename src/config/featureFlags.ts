export interface FeatureFlags {
  TICKET_NUMBERS_WRITE_ENABLED: boolean;

  TICKET_NUMBERS_READ_ENABLED: boolean;

  TICKET_BACKFILL_ENABLED: boolean;

  OCC_MODE_ENABLED: boolean;

  ROLLOUT_PERCENTAGE: number;
}

const defaultFlags: FeatureFlags = {
  TICKET_NUMBERS_WRITE_ENABLED: false,
  TICKET_NUMBERS_READ_ENABLED: false,
  TICKET_BACKFILL_ENABLED: false,
  OCC_MODE_ENABLED: false,
  ROLLOUT_PERCENTAGE: 0,
};

function getFeatureFlagsInternal(): FeatureFlags {
  return {
    TICKET_NUMBERS_WRITE_ENABLED:
      process.env.TICKET_NUMBERS_WRITE_ENABLED === "true" ||
      defaultFlags.TICKET_NUMBERS_WRITE_ENABLED,

    TICKET_NUMBERS_READ_ENABLED:
      process.env.TICKET_NUMBERS_READ_ENABLED === "true" ||
      defaultFlags.TICKET_NUMBERS_READ_ENABLED,

    TICKET_BACKFILL_ENABLED:
      process.env.TICKET_BACKFILL_ENABLED === "true" ||
      defaultFlags.TICKET_BACKFILL_ENABLED,

    OCC_MODE_ENABLED:
      process.env.OCC_MODE_ENABLED === "true" || defaultFlags.OCC_MODE_ENABLED,

    ROLLOUT_PERCENTAGE:
      parseInt(process.env.ROLLOUT_PERCENTAGE || "0") ||
      defaultFlags.ROLLOUT_PERCENTAGE,
  };
}

export function getFeatureFlags(): FeatureFlags {
  const flags = getFeatureFlagsInternal();

  if (!getFeatureFlags._logged) {
    logFeatureFlags(flags);
    getFeatureFlags._logged = true;
  }

  return flags;
}

getFeatureFlags._logged = false;

export function isFeatureEnabledForRound(
  roundId: string,
  featureName: keyof FeatureFlags
): boolean {
  const flags = getFeatureFlags();

  if (!flags[featureName]) {
    return false;
  }

  if (
    featureName === "TICKET_NUMBERS_WRITE_ENABLED" ||
    featureName === "TICKET_NUMBERS_READ_ENABLED"
  ) {
    const roundNumber = parseInt(roundId);
    const isInRollout = roundNumber % 100 < flags.ROLLOUT_PERCENTAGE;

    return isInRollout;
  }

  return flags[featureName] as boolean;
}

export function logFeatureFlags(flags?: FeatureFlags): void {
  const flagsToLog = flags || getFeatureFlagsInternal();
  console.log("Feature Flags Status:", {
    writeEnabled: flagsToLog.TICKET_NUMBERS_WRITE_ENABLED,
    readEnabled: flagsToLog.TICKET_NUMBERS_READ_ENABLED,
    backfillEnabled: flagsToLog.TICKET_BACKFILL_ENABLED,
    occMode: flagsToLog.OCC_MODE_ENABLED,
    rolloutPercentage: `${flagsToLog.ROLLOUT_PERCENTAGE}%`,
  });
}
