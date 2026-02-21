import { TaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ScoringConfig = {
  baseCoins: Record<TaskType, number>;
  verificationMultiplierChecks: number;
  verificationMultiplierMergeOnly: number;
  sizeMultiplierSmall: number;
  sizeMultiplierMedium: number;
  sizeMultiplierLarge: number;
  sizeThresholdMedium: number;
  sizeThresholdLarge: number;
};

const DEFAULTS: ScoringConfig = {
  baseCoins: {
    MAINTENANCE: 10,
    TOIL: 15,
    RELIABILITY: 20,
    SECURITY: 25,
  },
  verificationMultiplierChecks: 1.25,
  verificationMultiplierMergeOnly: 1.0,
  sizeMultiplierSmall: 1.0,
  sizeMultiplierMedium: 1.1,
  sizeMultiplierLarge: 1.2,
  sizeThresholdMedium: 100,
  sizeThresholdLarge: 500,
};

export async function loadScoringConfig(): Promise<ScoringConfig> {
  const rows = await prisma.config.findMany();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const n = (key: string, fallback: number) =>
    map[key] !== undefined ? parseFloat(map[key]) : fallback;

  return {
    baseCoins: {
      MAINTENANCE: n("base_coins_maintenance", DEFAULTS.baseCoins.MAINTENANCE),
      TOIL: n("base_coins_toil", DEFAULTS.baseCoins.TOIL),
      RELIABILITY: n("base_coins_reliability", DEFAULTS.baseCoins.RELIABILITY),
      SECURITY: n("base_coins_security", DEFAULTS.baseCoins.SECURITY),
    },
    verificationMultiplierChecks: n(
      "verification_multiplier_checks",
      DEFAULTS.verificationMultiplierChecks
    ),
    verificationMultiplierMergeOnly: n(
      "verification_multiplier_merge_only",
      DEFAULTS.verificationMultiplierMergeOnly
    ),
    sizeMultiplierSmall: n("size_multiplier_small", DEFAULTS.sizeMultiplierSmall),
    sizeMultiplierMedium: n("size_multiplier_medium", DEFAULTS.sizeMultiplierMedium),
    sizeMultiplierLarge: n("size_multiplier_large", DEFAULTS.sizeMultiplierLarge),
    sizeThresholdMedium: n("size_threshold_medium", DEFAULTS.sizeThresholdMedium),
    sizeThresholdLarge: n("size_threshold_large", DEFAULTS.sizeThresholdLarge),
  };
}

export function getSizeMultiplier(
  locChanged: number | null | undefined,
  config: ScoringConfig
): number {
  if (!locChanged) return config.sizeMultiplierSmall;
  if (locChanged >= config.sizeThresholdLarge) return config.sizeMultiplierLarge;
  if (locChanged >= config.sizeThresholdMedium) return config.sizeMultiplierMedium;
  return config.sizeMultiplierSmall;
}

export function computeCoins(params: {
  taskType: TaskType;
  ciPassed: boolean;
  locChanged: number | null | undefined;
  upgradeMultiplier: number;
  config: ScoringConfig;
  verificationMode: "checks" | "merge_only";
}): {
  baseCoins: number;
  verificationMultiplier: number;
  sizeMultiplier: number;
  upgradeMultiplier: number;
  totalCoins: number;
} {
  const { taskType, ciPassed, locChanged, upgradeMultiplier, config, verificationMode } = params;

  const baseCoins = config.baseCoins[taskType];

  const verificationMultiplier =
    verificationMode === "checks" && ciPassed
      ? config.verificationMultiplierChecks
      : config.verificationMultiplierMergeOnly;

  const sizeMultiplier = getSizeMultiplier(locChanged, config);

  const totalCoins = Math.round(
    baseCoins * verificationMultiplier * sizeMultiplier * upgradeMultiplier
  );

  return { baseCoins, verificationMultiplier, sizeMultiplier, upgradeMultiplier, totalCoins };
}

export async function getFarmUpgradeMultiplier(
  orgId: string,
  taskType: TaskType
): Promise<number> {
  const farm = await prisma.farm.findUnique({
    where: { orgId },
    include: {
      upgrades: {
        include: { shopItem: true },
      },
    },
  });

  if (!farm) return 1.0;

  let multiplier = 1.0;
  for (const upgrade of farm.upgrades) {
    const item = upgrade.shopItem;
    if (item.taskType === null || item.taskType === taskType) {
      multiplier *= Math.pow(item.multiplier, upgrade.level);
    }
  }

  return multiplier;
}
