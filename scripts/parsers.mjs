/**
 * Text parsers that extract structured combat data (attacks, damage, saves,
 * ranges, limited uses) out of the free-form description strings used by
 * Worldsmith stat blocks. These are deliberately tolerant: anything that cannot
 * be confidently parsed is simply left out so the original text remains intact
 * in the generated item description.
 */

import { ABILITY_MAP, DAMAGE_TYPES } from "./constants.mjs";

/**
 * @typedef {object} ParsedDamagePart
 * @property {number} number        Number of dice.
 * @property {number} denomination  Die size.
 * @property {string} bonus         Flat bonus formula.
 * @property {string[]} types       Damage type keys.
 */

/**
 * Extract every damage expression (e.g. "1d8+4 piercing damage") found in the text.
 * @param {string} text
 * @returns {ParsedDamagePart[]}
 */
export function parseDamageParts(text) {
  if (!text) return [];
  const parts = [];
  const types = [...DAMAGE_TYPES].join("|");
  // Allow non-period filler (e.g. ") " or " psychic") between the dice and the
  // damage type so expressions like "30 (6d10) psychic damage" are captured,
  // while the period exclusion keeps a match from spilling into another sentence.
  const re = new RegExp(
    `(\\d+)d(\\d+)\\s*(?:([+-])\\s*(\\d+))?[^.]*?\\b(${types})\\s+damage`,
    "gi"
  );
  let match;
  while ((match = re.exec(text)) !== null) {
    const [, count, denom, sign, flat, type] = match;
    let bonus = "";
    if (flat) bonus = sign === "-" ? `-${flat}` : flat;
    parts.push({
      number: Number(count),
      denomination: Number(denom),
      bonus,
      types: [type.toLowerCase()]
    });
  }
  return parts;
}

/**
 * @typedef {object} ParsedAttack
 * @property {string} bonus  Flat to-hit bonus (without a leading "+").
 * @property {string} value  "melee" or "ranged".
 * @property {string} classification  "weapon" or "spell".
 */

/**
 * Parse the attack portion of a description.
 * @param {string} text
 * @returns {ParsedAttack|null}
 */
export function parseAttack(text) {
  if (!text) return null;
  const toHit = text.match(/([+-]?\d+)\s+to hit/i);
  const isMeleeRanged = text.match(/\b(melee|ranged)\b/i);
  const isWeaponSpell = text.match(/\b(weapon|spell)\b\s+attack/i);
  if (!toHit && !isMeleeRanged) return null;
  if (!/attack/i.test(text)) return null;

  let bonus = "";
  if (toHit) bonus = toHit[1].replace(/^\+/, "");
  return {
    bonus,
    value: isMeleeRanged ? isMeleeRanged[1].toLowerCase() : "melee",
    classification: isWeaponSpell ? isWeaponSpell[1].toLowerCase() : "weapon"
  };
}

/**
 * @typedef {object} ParsedSave
 * @property {number} dc        Difficulty class.
 * @property {string} ability   dnd5e ability key.
 * @property {string} onSave    "half" or "none".
 */

/**
 * Parse a saving throw requirement from a description.
 * @param {string} text
 * @returns {ParsedSave|null}
 */
export function parseSave(text) {
  if (!text) return null;
  const match = text.match(/DC\s+(\d+)\s+([A-Za-z]+)\s+saving throw/i);
  if (!match) return null;
  const ability = ABILITY_MAP[match[2].toLowerCase()];
  if (!ability) return null;
  const onSave = /half as much|half damage|half the damage|or half/i.test(text) ? "half" : "none";
  return { dc: Number(match[1]), ability, onSave };
}

/**
 * @typedef {object} ParsedRange
 * @property {number} [reach]  Reach in the configured units (melee).
 * @property {number} [value]  Short range (ranged).
 * @property {number} [long]   Long range (ranged).
 * @property {string} units    Distance units (always "ft" here).
 */

/**
 * Parse reach/range information from a description.
 * @param {string} text
 * @returns {ParsedRange|null}
 */
export function parseRange(text) {
  if (!text) return null;
  const result = { units: "ft" };
  const reach = text.match(/reach\s+(\d+)\s*(?:ft|feet|')/i);
  if (reach) result.reach = Number(reach[1]);
  const range = text.match(/range\s+(\d+)(?:\s*\/\s*(\d+))?\s*(?:ft|feet|')/i);
  if (range) {
    result.value = Number(range[1]);
    if (range[2]) result.long = Number(range[2]);
  }
  const within = text.match(/within\s+(\d+)\s*(?:ft|feet|')/i);
  if (within && !reach && !range) result.value = Number(within[1]);
  if (result.reach === undefined && result.value === undefined) return null;
  return result;
}

/**
 * @typedef {object} ParsedUses
 * @property {string} max
 * @property {Array<{period: string, type: string, formula?: string}>} recovery
 */

/**
 * Parse limited-use / recharge phrasing from a description.
 * @param {string} text
 * @returns {ParsedUses|null}
 */
export function parseUses(text) {
  if (!text) return null;

  const recharge = text.match(/recharge\s+(\d)(?:\s*[-–]\s*\d)?/i);
  if (recharge) {
    return { max: "1", recovery: [{ period: "recharge", type: "recoverAll", formula: recharge[1] }] };
  }

  const perDay = text.match(/(\d+)\s*\/\s*day/i);
  if (perDay) {
    return { max: perDay[1], recovery: [{ period: "day", type: "recoverAll" }] };
  }

  const perRest = text.match(/once per (short|long) rest/i)
    || text.match(/once per (short|long)\b/i);
  if (perRest) {
    const period = perRest[1].toLowerCase() === "long" ? "lr" : "sr";
    return { max: "1", recovery: [{ period, type: "recoverAll" }] };
  }

  const untilRest = text.match(/(?:until|after)\s+(?:a\s+)?(short|long) rest/i);
  if (untilRest) {
    const period = untilRest[1].toLowerCase() === "long" ? "lr" : "sr";
    return { max: "1", recovery: [{ period, type: "recoverAll" }] };
  }

  return null;
}

/**
 * Determine whether a description represents a bonus action / reaction.
 * @param {string} text
 * @returns {string|null}  An activation type override, if detected.
 */
export function parseActivationType(text) {
  if (!text) return null;
  if (/as a bonus action/i.test(text)) return "bonus";
  if (/as a reaction|in response to/i.test(text)) return "reaction";
  return null;
}
