/**
 * Pure conversion logic that turns a Worldsmith *item* export (weapons, armor,
 * potions, wondrous items, etc.) into the data needed to create a dnd5e (v5+)
 * Item document in Foundry VTT. Like the creature converter, this is free of
 * Foundry runtime dependencies so it can be unit-tested in plain Node.
 */

import {
  ARMOR_TYPE_MAP, CATEGORY_MAP, CURRENCY_MAP, DAMAGE_TYPES, DIE_STEPS, ITEM_ICONS,
  MODULE_ID, RARITY_MAP, SIMPLE_WEAPONS, RANGED_WEAPONS, WEAPON_PROPERTY_MAP
} from "./constants.mjs";
import { escapeHTML, splitList, textToHTML, toNumber } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/**
 * Parse a price expressed as a number ("75000") or string ("5,000 gp").
 * @param {string|number|undefined} value
 * @returns {{value: number, denomination: string}}
 */
function parsePrice(value) {
  if (value === undefined || value === null || value === "") return { value: 0, denomination: "gp" };
  if (typeof value === "number") return { value: Math.max(0, value), denomination: "gp" };
  const match = String(value).match(/([\d,]+(?:\.\d+)?)\s*(pp|gp|ep|sp|cp)?/i);
  if (!match) return { value: 0, denomination: "gp" };
  return {
    value: Math.max(0, Number(match[1].replace(/,/g, ""))),
    denomination: match[2] ? CURRENCY_MAP[match[2].toLowerCase()] : "gp"
  };
}

/**
 * Map a Worldsmith rarity word to a dnd5e rarity key.
 * @param {string|undefined} rarity
 * @returns {string}
 */
function parseRarity(rarity) {
  if (!rarity) return "";
  return RARITY_MAP[String(rarity).trim().toLowerCase()] ?? "";
}

/**
 * Convert a list of property words into dnd5e weapon property keys.
 * @param {string|null} properties
 * @returns {{keys: string[], unknown: string[]}}
 */
function parseWeaponProperties(properties) {
  const keys = [];
  const unknown = [];
  for (const prop of splitList(properties)) {
    const key = WEAPON_PROPERTY_MAP[prop.toLowerCase()];
    if (key) keys.push(key);
    else unknown.push(prop);
  }
  return { keys, unknown };
}

/**
 * Parse a weapon base-damage string such as "1d8 slashing" or "2d6+1 fire".
 * @param {string|null} damageDice
 * @returns {{number: number, denomination: number, bonus: string, types: string[]}|null}
 */
function parseWeaponDamage(damageDice) {
  if (!damageDice) return null;
  const match = String(damageDice).match(/(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*([A-Za-z]+)?/i);
  if (!match) return null;
  const [, count, denom, sign, flat, typeWord] = match;
  const type = typeWord?.toLowerCase();
  return {
    number: Number(count),
    denomination: Number(denom),
    bonus: flat ? (sign === "-" ? `-${flat}` : flat) : "",
    types: type && DAMAGE_TYPES.has(type) ? [type] : []
  };
}

/**
 * Step a die denomination up one size (used for versatile damage).
 * @param {number} denomination
 * @returns {number}
 */
function stepDie(denomination) {
  const idx = DIE_STEPS.indexOf(denomination);
  if (idx === -1) return denomination;
  return DIE_STEPS[Math.min(idx + 1, DIE_STEPS.length - 1)];
}

/**
 * Parse range / reach from a Worldsmith weapon range string.
 * @param {string|null} rangeStr
 * @param {boolean} ranged
 * @returns {{value: number|null, long: number|null, reach: number|null, units: string}}
 */
function parseWeaponRange(rangeStr, ranged) {
  const result = { value: null, long: null, reach: null, units: "ft" };
  if (!rangeStr) {
    if (!ranged) result.reach = 5;
    return result;
  }
  const split = String(rangeStr).match(/(\d+)\s*\/\s*(\d+)/);
  if (split) {
    result.value = Number(split[1]);
    result.long = Number(split[2]);
    return result;
  }
  const single = String(rangeStr).match(/(\d+)/);
  const n = single ? Number(single[1]) : null;
  if (ranged) result.value = n;
  else result.reach = n ?? 5;
  return result;
}

/**
 * Parse a magical attack/damage bonus ("+2 bonus to attack rolls") from text.
 * @param {string} text
 * @returns {number}
 */
function parseMagicalBonus(text) {
  if (!text) return 0;
  const match = text.match(/\+(\d+)\b[^.]{0,40}?\b(?:to hit|attack)/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Parse charges / recharge phrasing for magic items, e.g.
 * "It has 3 charges that recharge at dawn".
 * @param {string} text
 * @returns {{max: string, recovery: Array<object>}|null}
 */
function parseCharges(text) {
  if (!text) return null;
  const charges = text.match(/(\d+)\s+charges?/i);
  if (!charges) return null;
  let period = "day";
  if (/at dawn/i.test(text)) period = "dawn";
  else if (/at dusk/i.test(text)) period = "dusk";
  const recover = text.match(/regains?\s+(\d+d\d+(?:\s*\+\s*\d+)?|\d+)\s+(?:expended\s+)?charges?/i);
  const recovery = { period, type: "recoverAll" };
  if (recover) {
    recovery.type = "formula";
    recovery.formula = recover[1].replace(/\s+/g, "");
  }
  return { max: charges[1], recovery: [recovery] };
}

/**
 * Build the rich-text description for an imported item.
 * @param {object} data
 * @returns {string}
 */
function buildItemDescription(data) {
  const sections = [];
  if (data.subtitle) sections.push(`<p><em>${escapeHTML(data.subtitle)}</em></p>`);
  if (data.description) sections.push(textToHTML(data.description));
  if (data.usage) sections.push(`<h3>Properties</h3>${textToHTML(data.usage)}`);
  if (data.attunement?.required && data.attunement?.condition) {
    sections.push(`<p><strong>Attunement:</strong> ${escapeHTML(data.attunement.condition)}</p>`);
  }
  if (data.lore) sections.push(`<hr><h3>Lore</h3>${textToHTML(data.lore)}`);
  return sections.join("");
}

/**
 * Determine the dnd5e item type & subtype for a Worldsmith item.
 * @param {object} data
 * @returns {{type: string, subtype?: string}}
 */
function resolveItemType(data) {
  if (data.weaponData) return { type: "weapon" };
  if (data.armorData) return { type: "equipment" };
  const category = String(data.category ?? "").trim().toLowerCase();
  return CATEGORY_MAP[category] ?? { type: "loot" };
}

/**
 * Populate weapon-specific system data.
 * @param {object} data
 * @param {object} system
 * @param {string[]} warnings
 */
function applyWeaponData(data, system, warnings) {
  const wd = data.weaponData ?? {};
  const baseItem = String(wd.weaponType ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const { keys: propertyKeys, unknown } = parseWeaponProperties(wd.properties);
  for (const u of unknown) warnings.push(`Unrecognised weapon property "${u}" was skipped.`);

  const ranged = RANGED_WEAPONS.has(baseItem)
    || /\d+\s*\/\s*\d+/.test(wd.range ?? "")
    || propertyKeys.includes("amm");
  const simple = SIMPLE_WEAPONS.has(baseItem);
  system.type = {
    value: ranged ? (simple ? "simpleR" : "martialR") : (simple ? "simpleM" : "martialM"),
    baseItem: baseItem || ""
  };

  const base = parseWeaponDamage(wd.damageDice);
  system.damage = { base: base ?? { number: null, denomination: null, bonus: "", types: [] } };
  if (base && propertyKeys.includes("ver")) {
    system.damage.versatile = { ...base, denomination: stepDie(base.denomination) };
  }

  system.range = parseWeaponRange(wd.range, ranged);

  const magicalBonus = parseMagicalBonus(data.usage);
  if (magicalBonus > 0) {
    system.magicalBonus = magicalBonus;
    if (!propertyKeys.includes("mgc")) propertyKeys.push("mgc");
  }
  if (parseRarity(data.rarity) && !propertyKeys.includes("mgc") && /magic/i.test(data.rarity ?? "")) {
    propertyKeys.push("mgc");
  }

  system.properties = propertyKeys;
  if (wd.masteries) system.mastery = String(wd.masteries).trim().toLowerCase();
}

/**
 * Populate armor-specific (equipment) system data.
 * @param {object} data
 * @param {object} system
 */
function applyArmorData(data, system) {
  const ad = data.armorData ?? {};
  const typeWord = String(ad.armorType ?? ad.type ?? "").trim().toLowerCase();
  system.type = { value: ARMOR_TYPE_MAP[typeWord] ?? "light" };
  const ac = toNumber(ad.baseAC ?? ad.ac ?? ad.armorClass ?? ad.value, 0);
  system.armor = { value: ac };
  if (ad.maxDex !== undefined && ad.maxDex !== null) system.armor.dex = toNumber(ad.maxDex);
  if (ad.strength !== undefined && ad.strength !== null) system.strength = toNumber(ad.strength);
  const { keys } = parseWeaponProperties(ad.properties);
  if (keys.length) system.properties = keys;
}

/**
 * Convert a Worldsmith item export into Foundry item creation data.
 * @param {object} data  Parsed Worldsmith item JSON.
 * @returns {{itemData: object, warnings: string[]}}
 */
export function convertWorldsmithItem(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith item data must be an object.");
  }

  const { type, subtype } = resolveItemType(data);
  const name = data.name || "Imported Item";

  const system = {
    description: { value: buildItemDescription(data) },
    rarity: parseRarity(data.rarity),
    price: parsePrice(data.value ?? data.price),
    weight: { value: toNumber(data.weight, 0), units: "lb" },
    quantity: toNumber(data.quantity, 1),
    source: { custom: "Imported from Worldsmith" }
  };

  // Attunement / equippable fields are valid for weapon, equipment, consumable.
  if (["weapon", "equipment", "consumable"].includes(type)) {
    system.attunement = data.attunement?.required ? "required" : "";
  }

  if (type === "weapon") {
    applyWeaponData(data, system, warnings);
  } else if (type === "equipment") {
    if (data.armorData) applyArmorData(data, system);
    else system.type = { value: subtype ?? "trinket" };
  } else if (type === "consumable") {
    system.type = { value: subtype ?? "trinket" };
  } else if (type === "tool") {
    system.type = { value: "" };
  }

  const charges = parseCharges(data.usage);
  if (charges && type !== "loot") {
    system.uses = { spent: 0, max: charges.max, recovery: charges.recovery };
  }

  const itemData = {
    name,
    type,
    img: ITEM_ICONS[type] ?? ITEM_ICONS.loot,
    system,
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "item",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { itemData, warnings };
}
