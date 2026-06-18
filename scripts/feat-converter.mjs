/**
 * Pure conversion logic that turns a Worldsmith *feat* export into the data
 * needed to create a dnd5e (v5+) feat Item in Foundry VTT. Foundry-runtime free
 * so it can be unit-tested in plain Node.
 */

import { MODULE_ID } from "./constants.mjs";
import { parseAttack, parseDamageParts, parseSave, parseUses } from "./parsers.mjs";
import { escapeHTML, randomID, textToHTML } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/**
 * Convert a parsed damage part into a dnd5e DamageData object.
 * @param {object} part
 * @returns {object}
 */
function toDamageData(part) {
  return {
    number: part.number,
    denomination: part.denomination,
    bonus: part.bonus ?? "",
    types: part.types ?? []
  };
}

/**
 * Build the feat description from its flavor, mechanics, and prerequisites.
 * @param {object} data
 * @param {string} requirements
 * @returns {string}
 */
function buildFeatDescription(data, requirements) {
  const sections = [];
  if (data.subtitle) sections.push(`<p><em>${escapeHTML(data.subtitle)}</em></p>`);
  if (requirements) sections.push(`<p><strong>Prerequisites:</strong> ${escapeHTML(requirements)}</p>`);
  if (data.lore) sections.push(textToHTML(data.lore));
  if (data.mechanics) sections.push(textToHTML(data.mechanics));
  return sections.join("");
}

/**
 * Build at most one activity for the feat: an attack, save, or damage activity
 * if the mechanics describe one, otherwise a utility activity when the feat has
 * limited uses (so the uses can be expended). Passive feats get no activity.
 * @param {string} text
 * @param {object|null} uses
 * @returns {object}
 */
function buildFeatActivities(text, uses) {
  const activities = {};
  const damage = parseDamageParts(text).map(toDamageData);
  const attack = parseAttack(text);
  const save = parseSave(text);
  const id = randomID();
  const act = { type: "action", value: null, override: true };

  let activity = null;
  if (attack) {
    activity = {
      _id: id,
      type: "attack",
      activation: act,
      attack: {
        ability: "",
        bonus: attack.bonus,
        flat: true,
        type: { value: attack.value, classification: attack.classification }
      },
      damage: { includeBase: false, parts: damage }
    };
  } else if (save) {
    activity = {
      _id: id,
      type: "save",
      activation: act,
      save: { ability: [save.ability], dc: { calculation: "", formula: String(save.dc) } },
      damage: { onSave: save.onSave, parts: damage }
    };
  } else if (damage.length) {
    activity = { _id: id, type: "damage", activation: act, damage: { parts: damage } };
  } else if (uses) {
    activity = { _id: id, type: "utility", activation: { type: "special", value: null, override: true } };
  }

  if (!activity) return activities;
  if (uses) {
    activity.consumption = {
      targets: [{ type: "itemUses", value: "1", target: "", scaling: { mode: "", formula: "" } }],
      scaling: { allowed: false, max: "" },
      spellSlot: false
    };
  }
  activities[id] = activity;
  return activities;
}

/**
 * Convert a Worldsmith feat export into Foundry feat item creation data.
 * @param {object} data  Parsed Worldsmith feat JSON.
 * @returns {{itemData: object, warnings: string[]}}
 */
export function convertWorldsmithFeat(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith feat data must be an object.");
  }

  const prereqs = Array.isArray(data.prerequisites) ? data.prerequisites : [];
  const requirements = prereqs
    .map(p => (p?.details ? p.details : (p?.type ? String(p.type) : "")))
    .filter(Boolean)
    .join("; ");

  // Pull a numeric level prerequisite if one is present.
  let level = null;
  for (const p of prereqs) {
    const isLevelType = String(p?.type ?? "").toLowerCase().includes("level");
    const match = String(p?.details ?? "").match(/level\s+(\d+)/i)
      ?? (isLevelType ? String(p?.details ?? "").match(/(\d+)/) : null);
    if (match) { level = Number(match[1]); break; }
  }

  const mechanics = data.mechanics ?? "";
  const uses = parseUses(mechanics);
  const activities = buildFeatActivities(mechanics, uses);

  const system = {
    description: { value: buildFeatDescription(data, requirements) },
    type: { value: "feat", subtype: "" },
    prerequisites: { level, repeatable: false },
    requirements,
    source: { custom: "Imported from Worldsmith" }
  };
  if (uses) system.uses = { spent: 0, max: uses.max, recovery: uses.recovery };
  if (Object.keys(activities).length) system.activities = activities;

  const itemData = {
    name: data.name || "Imported Feat",
    type: "feat",
    img: "icons/svg/upgrade.svg",
    system,
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "feat",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { itemData, warnings };
}
