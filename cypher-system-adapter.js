/**
 * Cypher System 3.5.2 compatibility adapter.
 * System-field access and rules calculations live here so the UI does not guess schemas.
 */

export const RECOVERY_GROUPS = Object.freeze([
  Object.freeze({
    label: "1 Action",
    description: "Spend: one action",
    keys: Object.freeze(["oneAction", "oneAction2", "oneAction3", "oneAction4", "oneAction5", "oneAction6", "oneAction7"]),
    countPath: "system.settings.combat.numberOneActionRecoveries"
  }),
  Object.freeze({
    label: "10 Minutes",
    description: "Spend: ten minutes rest",
    keys: Object.freeze(["tenMinutes", "tenMinutes2"]),
    countPath: "system.settings.combat.numberTenMinuteRecoveries"
  }),
  Object.freeze({ label: "1 Hour", description: "Spend: one hour rest", keys: Object.freeze(["oneHour"]) }),
  Object.freeze({ label: "10 Hours", description: "Spend: ten hours rest", keys: Object.freeze(["tenHours"]) })
]);

export const RECOVERY_RESET_UPDATE = Object.freeze(Object.fromEntries(
  RECOVERY_GROUPS.flatMap(group => group.keys.map(key => [`system.combat.recoveries.${key}`, false]))
));

function finiteInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

/** Return the four visible recovery groups, honoring additional native recoveries. */
export function getRecoveryGroups(system = {}) {
  const recoveries = system.combat?.recoveries ?? {};
  return RECOVERY_GROUPS.map((group, index) => {
    const configuredValue = group.countPath
      ? group.countPath.split(".").reduce((value, key) => value?.[key], { system })
      : undefined;
    const configured = group.countPath
      ? finiteInteger(configuredValue, 1, 0, group.keys.length)
      : 1;
    const enabledKeys = group.keys.slice(0, configured);
    const availableKeys = enabledKeys.filter(key => recoveries[key] !== true);
    return {
      ...group,
      index,
      available: availableKeys.length > 0,
      nextKey: availableKeys[0] ?? null,
      enabledCount: enabledKeys.length,
      remainingCount: availableKeys.length
    };
  });
}

/**
 * Validate order and return a native boolean update for one recovery.
 * false = available, true = used in Cypher System 3.5.2.
 */
export function getRecoverySpendUpdate(system = {}, index) {
  const groups = getRecoveryGroups(system);
  const selected = groups[index];
  if (!selected?.available) return { ok: false, reason: "spent" };
  if (groups.slice(0, index).some(group => group.available)) return { ok: false, reason: "order" };
  return {
    ok: true,
    key: selected.nextKey,
    path: `system.combat.recoveries.${selected.nextKey}`,
    update: { [`system.combat.recoveries.${selected.nextKey}`]: true }
  };
}

/** Compare the d20 result plus flat bonus with the final target number exactly once. */
export function resolveRollOutcome({ natural, bonus = 0, finalDifficulty = 0 }) {
  const die = finiteInteger(natural, 0, 0, 20);
  const flatBonus = finiteInteger(bonus, 0, -100, 100);
  const difficulty = finiteInteger(finalDifficulty, 0, 0, 15);
  const total = die + flatBonus;
  const target = difficulty * 3;
  return {
    total,
    target,
    success: die !== 1 && total >= target,
    naturalOne: die === 1,
    achievedDifficulty: Math.max(0, Math.floor(total / 3))
  };
}

/** Native aggregate Effort cost: 3 points for level one, +2 per additional level. */
export function calculateEffortCost(levels, { firstLevelCostsTwo = false, impaired = false, speedArmorCost = 0 } = {}) {
  const totalLevels = finiteInteger(levels, 0, 0, 100);
  if (totalLevels <= 0) return 0;
  const base = (firstLevelCostsTwo ? 2 : 3) + Math.max(0, totalLevels - 1) * 2;
  return base + (impaired ? totalLevels : 0) + Math.max(0, finiteInteger(speedArmorCost, 0, 0, 100));
}
