/**
 * Pure conversion logic that turns a Worldsmith *spell* export into the data
 * needed to create a dnd5e (v5+) spell Item in Foundry VTT. Foundry-runtime free
 * so it can be unit-tested in plain Node.
 */

import { ABILITY_MAP, MODULE_ID, SPELL_SCHOOL_MAP } from "./constants.mjs";
import { parseDamageParts } from "./parsers.mjs";
import { escapeHTML, randomID, textToHTML, toNumber } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/**
 * Convert a Worldsmith casting time into a dnd5e activation object.
 * @param {string|undefined} castingTime
 * @returns {{type: string, value: (number|null), condition: string}}
 */
function parseActivation(castingTime) {
  const text = String(castingTime ?? "").trim();
  const lower = text.toLowerCase();
  if (!lower) return { type: "action", value: null, condition: "" };
  if (lower.includes("bonus")) return { type: "bonus", value: null, condition: "" };
  if (lower.includes("reaction")) {
    const condition = text.replace(/^[^,]*,?\s*/i, "").trim();
    return { type: "reaction", value: null, condition: /which you take/i.test(text) ? condition : "" };
  }
  const timed = lower.match(/(\d+)\s*(minute|hour|round|day)/);
  if (timed) return { type: timed[2], value: Number(timed[1]), condition: "" };
  return { type: "action", value: null, condition: "" };
}

/**
 * Convert a Worldsmith duration string into a dnd5e duration object.
 * @param {string|undefined} duration
 * @param {boolean} concentration
 * @returns {{value: string, units: string}}
 */
function parseDuration(duration, concentration) {
  const text = String(duration ?? "").trim();
  const lower = text.toLowerCase();
  if (!lower || lower.includes("instant")) return { value: "", units: "inst" };
  if (lower.includes("until dispelled")) return { value: "", units: "disp" };
  if (lower.includes("permanent")) return { value: "", units: "perm" };
  const timed = lower.match(/(\d+)\s*(round|minute|hour|day|month|year)/);
  if (timed) return { value: String(timed[1]), units: timed[2] };
  if (concentration) return { value: "", units: "spec" };
  return { value: "", units: "spec" };
}

/**
 * Best-effort parse of a spell's range from its description.
 * @param {string} description
 * @returns {{value: string, units: string}|null}
 */
function parseSpellRange(description) {
  const text = String(description ?? "");
  const within = text.match(/(?:within|range of|range[:\s]+)\s*(\d+)\s*(?:feet|foot|ft)/i)
    || text.match(/(\d+)[-\s]foot\b/i);
  if (within) return { value: String(within[1]), units: "ft" };
  if (/\byou touch\b|\brange[:\s]+touch\b/i.test(text)) return { value: "", units: "touch" };
  if (/\brange[:\s]+self\b/i.test(text)) return { value: "", units: "self" };
  return null;
}

/**
 * Parse a saving throw ability from a spell description (DC is the caster's
 * spellcasting DC).
 * @param {string} text
 * @returns {{ability: string, onSave: string}|null}
 */
function parseSpellSave(text) {
  const match = String(text ?? "").match(
    /\b(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\s+saving throw/i
  );
  if (!match) return null;
  const ability = ABILITY_MAP[match[1].toLowerCase()];
  if (!ability) return null;
  const onSave = /half as much|half damage|half the damage|or half/i.test(text) ? "half" : "none";
  return { ability, onSave };
}

/**
 * Parse a spell attack from a description.
 * @param {string} text
 * @returns {{value: string}|null}
 */
function parseSpellAttack(text) {
  const match = String(text ?? "").match(/\b(ranged|melee)\s+spell attack/i);
  if (match) return { value: match[1].toLowerCase() };
  if (/\bspell attack\b/i.test(text)) return { value: "ranged" };
  return null;
}

/**
 * Build the activities collection for a spell from its description.
 * @param {string} description
 * @param {object} activation
 * @returns {object}
 */
function buildSpellActivities(description, activation) {
  const activities = {};
  const act = { type: activation.type, value: activation.value ?? null, override: false };
  const damage = parseDamageParts(description).map(p => ({
    number: p.number, denomination: p.denomination, bonus: p.bonus ?? "", types: p.types ?? []
  }));
  const attack = parseSpellAttack(description);
  const save = parseSpellSave(description);

  if (attack) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "attack",
      activation: act,
      attack: {
        ability: "spellcasting",
        type: { value: attack.value, classification: "spell" }
      },
      damage: { includeBase: false, parts: damage }
    };
  } else if (save) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "save",
      activation: act,
      save: { ability: [save.ability], dc: { calculation: "spellcasting", formula: "" } },
      damage: { onSave: save.onSave, parts: damage }
    };
  } else if (damage.length) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "damage",
      activation: act,
      damage: { parts: damage }
    };
  } else {
    const id = randomID();
    activities[id] = { _id: id, type: "utility", activation: act };
  }

  return activities;
}

/**
 * Build the spell description, appending class/species availability and lore.
 * @param {object} data
 * @returns {string}
 */
function buildSpellDescription(data) {
  const sections = [];
  if (data.description) sections.push(textToHTML(data.description));
  const meta = [];
  if (data.classes) meta.push(`<p><strong>Classes:</strong> ${escapeHTML(String(data.classes))}</p>`);
  if (data.species) meta.push(`<p><strong>Species:</strong> ${escapeHTML(String(data.species))}</p>`);
  if (meta.length) sections.push(`<hr>${meta.join("")}`);
  if (data.lore) sections.push(`<h3>Lore</h3>${textToHTML(data.lore)}`);
  return sections.join("");
}

/**
 * Convert a Worldsmith spell export into Foundry spell item creation data.
 * @param {object} data  Parsed Worldsmith spell JSON.
 * @returns {{itemData: object, warnings: string[]}}
 */
export function convertWorldsmithSpell(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith spell data must be an object.");
  }

  const schoolKey = SPELL_SCHOOL_MAP[String(data.school ?? "").trim().toLowerCase()] ?? "";
  if (data.school && !schoolKey) warnings.push(`Unrecognised spell school "${data.school}".`);

  const properties = [];
  if (data.verbal) properties.push("vocal");
  if (data.somatic) properties.push("somatic");
  if (data.material) properties.push("material");
  if (data.ritual) properties.push("ritual");
  if (data.concentration) properties.push("concentration");

  const activation = parseActivation(data.castingTime);
  const duration = parseDuration(data.duration, data.concentration);
  const range = parseSpellRange(data.description);

  const materials = { value: "", consumed: false, cost: 0, supply: 0 };
  if (typeof data.material === "string" && data.material.trim()) {
    materials.value = data.material.trim();
    const cost = data.material.match(/([\d,]+)\s*gp/i);
    if (cost) materials.cost = Number(cost[1].replace(/,/g, ""));
    if (/consume|consumed/i.test(data.material)) materials.consumed = true;
  }

  const system = {
    description: { value: buildSpellDescription(data) },
    level: toNumber(data.level, 0),
    school: schoolKey,
    properties,
    materials,
    activation: { type: activation.type, value: activation.value, condition: activation.condition },
    duration,
    method: "spell",
    prepared: 0,
    activities: buildSpellActivities(data.description, activation),
    source: { custom: "Imported from Worldsmith" }
  };
  if (range) system.range = { value: range.value, units: range.units, special: "" };

  const itemData = {
    name: data.name || "Imported Spell",
    type: "spell",
    img: "icons/svg/explosion.svg",
    system,
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "spell",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { itemData, warnings };
}
