/**
 * Pure conversion logic that turns a parsed Worldsmith export object into the
 * data needed to create a dnd5e (v5+) NPC actor in Foundry VTT (v13+). The
 * module entry point feeds the result of this function straight into
 * `Actor.create`. It intentionally avoids touching the Foundry runtime so it
 * can be unit-tested in plain Node.
 */

import {
  ABILITY_MAP, CONDITION_TYPES, CREATURE_TYPES, CURRENCY_MAP, DAMAGE_TYPES,
  ICONS, LANGUAGE_MAP, MODULE_ID, SIZE_MAP, SKILL_MAP
} from "./constants.mjs";
import {
  parseAttack, parseDamageParts, parseRange, parseSave, parseUses, parseActivationType
} from "./parsers.mjs";
import { escapeHTML, parseCR, randomID, splitList, textToHTML, toNumber } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/**
 * Compute the proficiency bonus for a given challenge rating, mirroring the
 * dnd5e proficiency table.
 * @param {number|null} cr
 * @returns {number}
 */
function proficiencyForCR(cr) {
  const level = Math.max(cr ?? 1, 1);
  return Math.floor((level + 7) / 4);
}

/**
 * Split a free-form damage/condition trait string into recognised system keys
 * plus a custom remainder string.
 * @param {string|null} value
 * @param {Set<string>} known
 * @returns {{value: string[], custom: string}}
 */
function splitTrait(value, known) {
  const result = { value: [], custom: "" };
  const custom = [];
  for (const entry of splitList(value)) {
    const key = entry.toLowerCase();
    if (known.has(key)) result.value.push(key);
    else custom.push(entry);
  }
  result.custom = custom.join(", ");
  return result;
}

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
 * Build the activities collection for an item from its description text.
 * @param {string} text
 * @param {{type: string, value: (number|null)}} activation
 * @returns {object}  Activities keyed by id.
 */
function buildActivities(text, activation) {
  const activities = {};
  const act = { type: activation.type, value: activation.value ?? null, override: true };

  const attack = parseAttack(text);
  const save = parseSave(text);
  const damage = parseDamageParts(text);
  const range = parseRange(text);

  const rangeData = range
    ? {
      override: true,
      value: range.value ?? null,
      long: range.long ?? null,
      reach: range.reach ?? null,
      units: range.units
    }
    : undefined;

  if (attack) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "attack",
      activation: act,
      ...(rangeData ? { range: rangeData } : {}),
      attack: {
        ability: "",
        bonus: attack.bonus,
        flat: true,
        type: { value: attack.value, classification: attack.classification }
      },
      damage: {
        includeBase: false,
        parts: damage.map(toDamageData)
      }
    };
  }

  if (save) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "save",
      activation: act,
      ...(rangeData ? { range: rangeData } : {}),
      save: {
        ability: [save.ability],
        dc: { calculation: "", formula: String(save.dc) }
      },
      damage: {
        onSave: save.onSave,
        // When the item also has an attack, the damage belongs to the attack.
        parts: attack ? [] : damage.map(toDamageData)
      }
    };
  }

  // Pure damage with no attack roll or save (e.g. automatic damage).
  if (!attack && !save && damage.length) {
    const id = randomID();
    activities[id] = {
      _id: id,
      type: "damage",
      activation: act,
      ...(rangeData ? { range: rangeData } : {}),
      damage: { parts: damage.map(toDamageData) }
    };
  }

  return activities;
}

/**
 * Build a feat-type item (used for traits, actions, and legendary actions).
 * @param {object} options
 * @returns {object}
 */
function buildFeatItem({ name, description, activationType = "action", activationValue = null, isTrait = false, identifier, img }) {
  const text = description ?? "";
  const detectedActivation = parseActivationType(text);
  const activation = {
    type: detectedActivation ?? activationType,
    value: activationValue
  };
  const activities = buildActivities(text, activation);
  const uses = parseUses(text);

  const system = {
    description: { value: textToHTML(text) },
    type: { value: "monster", subtype: "" },
    activities
  };
  if (isTrait) system.properties = ["trait"];
  if (identifier) system.identifier = identifier;
  if (uses) system.uses = { spent: 0, max: uses.max, recovery: uses.recovery };

  return {
    name: name || "Unnamed",
    type: "feat",
    img: img ?? (Object.keys(activities).some(id => activities[id].type === "attack") ? ICONS.attack : (isTrait ? ICONS.feature : ICONS.action)),
    system
  };
}

/**
 * Parse a price string such as "5000 gp" into a dnd5e price object.
 * @param {string|number|undefined} price
 * @returns {{value: number, denomination: string}}
 */
function parsePrice(price) {
  if (price === undefined || price === null || price === "") return { value: 0, denomination: "gp" };
  if (typeof price === "number") return { value: price, denomination: "gp" };
  const match = String(price).match(/([\d,]+(?:\.\d+)?)\s*(pp|gp|ep|sp|cp)?/i);
  if (!match) return { value: 0, denomination: "gp" };
  return {
    value: Number(match[1].replace(/,/g, "")),
    denomination: match[2] ? CURRENCY_MAP[match[2].toLowerCase()] : "gp"
  };
}

/**
 * Build a loot item from a Worldsmith loot entry.
 * @param {object} entry
 * @returns {object}
 */
function buildLootItem(entry) {
  return {
    name: entry.item || entry.name || "Loot",
    type: "loot",
    img: ICONS.loot,
    system: {
      description: { value: textToHTML(entry.details || "") },
      quantity: toNumber(entry.quantity, 1),
      price: parsePrice(entry.price)
    }
  };
}

/**
 * Assemble the actor biography HTML, including the lore and the Worldsmith
 * companion-care details that have no native dnd5e home.
 * @param {object} data
 * @returns {string}
 */
function buildBiography(data) {
  const identity = data.identity ?? {};
  const sections = [];

  if (identity.title) sections.push(`<p><em>${escapeHTML(identity.title)}</em></p>`);
  if (identity.description) sections.push(textToHTML(identity.description));
  if (identity.lore) sections.push(`<h3>Lore</h3>${textToHTML(identity.lore)}`);

  const careRows = [
    ["Intelligence", data.intelligence],
    ["Care Level", data.care_level],
    ["Preferred Environment", data.preferred_environment],
    ["Dietary Habits", data.dietary_habits],
    ["Daily Exercise", data.daily_exercise],
    ["Housing Requirements", data.housing_requirements],
    ["Carrying Capacity", data.carrying_capacity],
    ["Rider Capacity", data.rider_capacity],
    ["Monthly Cost (gp)", data.monthly_cost_gp],
    ["Summoning Method", data.summoning_method],
    ["Bonding Ritual", data.bonding_ritual]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  const careLists = [];
  if (Array.isArray(data.positive_care) && data.positive_care.length) {
    careLists.push(
      `<p><strong>Positive Care Effects</strong></p><ul>${data.positive_care
        .map(c => `<li>${escapeHTML(c)}</li>`)
        .join("")}</ul>`
    );
  }
  if (Array.isArray(data.negative_care) && data.negative_care.length) {
    careLists.push(
      `<p><strong>Negative Care Effects</strong></p><ul>${data.negative_care
        .map(c => `<li>${escapeHTML(c)}</li>`)
        .join("")}</ul>`
    );
  }

  if (careRows.length || careLists.length) {
    let companion = `<hr><h3>Worldsmith Companion Details</h3>`;
    if (careRows.length) {
      companion += `<dl>${careRows
        .map(([label, value]) => `<dt><strong>${escapeHTML(label)}</strong></dt><dd>${escapeHTML(String(value))}</dd>`)
        .join("")}</dl>`;
    }
    companion += careLists.join("");
    sections.push(companion);
  }

  return sections.join("");
}

/**
 * Convert a Worldsmith export object into Foundry actor creation data.
 * @param {object} data  Parsed Worldsmith JSON.
 * @returns {{actorData: object, warnings: string[]}}
 */
export function convertWorldsmith(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith data must be an object.");
  }

  const identity = data.identity ?? {};
  const attributes = data.attributes ?? {};
  const abilities = attributes.abilities ?? {};

  const name = identity.name || "Imported Creature";
  const cr = parseCR(attributes.cr);
  const prof = proficiencyForCR(cr);

  // --- Abilities & saves ---
  const abilityData = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const src = abilities[key] ?? {};
    const value = toNumber(src.value, 10);
    const proficient = src.saveProficient ? 1 : 0;
    const ability = { value, proficient };

    if (src.saveBonus !== undefined && src.saveBonus !== null) {
      const mod = Math.floor((value - 10) / 2);
      const expected = mod + (proficient ? prof : 0);
      const delta = toNumber(src.saveBonus) - expected;
      if (delta !== 0) ability.bonuses = { save: String(delta) };
    }
    abilityData[key] = ability;
  }

  // --- Armor class ---
  const acSrc = attributes.ac ?? {};
  const acValue = toNumber(acSrc.value, 10);
  const isNatural = /natural/i.test(acSrc.type ?? "");
  const ac = { flat: acValue, calc: isNatural ? "natural" : "flat" };

  // --- Hit points / hit dice ---
  const hpSrc = attributes.hp ?? {};
  const hd = attributes.hitDice ?? {};
  let formula = "";
  if (hd.totalDice && hd.dieSize) {
    const die = String(hd.dieSize).replace(/^d/i, "");
    formula = `${hd.totalDice}d${die}`;
    if (hd.flatBonus) formula += ` + ${hd.flatBonus}`;
  }
  const maxHp = toNumber(hpSrc.max, toNumber(hpSrc.current, 10));
  const hp = {
    value: toNumber(hpSrc.current, maxHp),
    max: maxHp,
    formula
  };

  // --- Movement ---
  const speed = attributes.speed ?? {};
  const movement = { units: "ft" };
  for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
    if (speed[key] !== undefined) movement[key] = toNumber(speed[key]);
  }
  if (speed.hover) movement.hover = true;

  // --- Senses ---
  const sensesSrc = attributes.senses ?? {};
  const senses = { units: "ft" };
  for (const key of ["darkvision", "blindsight", "tremorsense", "truesight"]) {
    if (sensesSrc[key] !== undefined) senses[key] = toNumber(sensesSrc[key]);
  }

  // --- Skills ---
  const skills = {};
  for (const skill of attributes.proficiencies?.skills ?? []) {
    const key = SKILL_MAP[String(skill).toLowerCase()];
    if (key) skills[key] = { value: 1 };
    else warnings.push(`Unrecognised skill "${skill}" was skipped.`);
  }

  // --- Languages ---
  const languages = { value: [], custom: "" };
  const langCustom = [];
  for (const lang of splitList(attributes.proficiencies?.languages)) {
    const key = LANGUAGE_MAP[lang.toLowerCase()];
    if (key) languages.value.push(key);
    else langCustom.push(lang);
  }
  languages.custom = langCustom.join(", ");

  // --- Creature type ---
  const rawType = (identity.type ?? "").toString().trim();
  const typeKey = rawType.toLowerCase();
  const detailsType = CREATURE_TYPES.has(typeKey)
    ? { value: typeKey, subtype: identity.subtype ?? "" }
    : { value: "custom", custom: rawType, subtype: identity.subtype ?? "" };

  // --- Traits ---
  const traits = {
    size: SIZE_MAP[String(identity.size ?? "med").toLowerCase()] ?? "med",
    dv: splitTrait(attributes.vulnerabilities, DAMAGE_TYPES),
    dr: splitTrait(attributes.resistances, DAMAGE_TYPES),
    di: splitTrait(attributes.immunities, DAMAGE_TYPES),
    ci: splitTrait(attributes.conditionImmunities, CONDITION_TYPES),
    languages
  };

  // --- Items ---
  const items = [];

  if (data.numberOfAttacks) {
    items.push(buildFeatItem({
      name: "Multiattack",
      description: data.numberOfAttacks,
      activationType: "action"
    }));
  }

  for (const feature of data.features ?? []) {
    items.push(buildFeatItem({
      name: feature.name,
      description: feature.description,
      isTrait: true
    }));
  }

  for (const action of data.actions ?? []) {
    items.push(buildFeatItem({
      name: action.name,
      description: action.description,
      activationType: "action"
    }));
  }

  const legendary = data.legendaryActions ?? {};
  const legendaryActions = legendary.actions ?? [];
  for (const la of legendaryActions) {
    items.push(buildFeatItem({
      name: la.name,
      description: la.description,
      activationType: "legendary",
      activationValue: toNumber(la.cost, 1),
      img: ICONS.legendary
    }));
  }

  for (const entry of data.loot ?? []) {
    items.push(buildLootItem(entry));
  }

  // --- Resources ---
  const legendaryCount = toNumber(legendary.count, legendaryActions.length ? 3 : 0);
  const resources = {
    legact: { value: legendaryCount, max: legendaryCount }
  };

  const details = {
    type: detailsType,
    cr: cr,
    alignment: identity.alignment ?? "",
    biography: { value: buildBiography(data) }
  };
  if (data.preferred_environment) details.habitat = { custom: data.preferred_environment };

  const actorData = {
    name,
    type: "npc",
    img: ICONS.actor,
    system: {
      abilities: abilityData,
      attributes: { ac, hp, movement, senses },
      details,
      traits,
      skills,
      resources,
      source: { custom: "Imported from Worldsmith" }
    },
    items,
    prototypeToken: {
      name,
      actorLink: false,
      sight: { enabled: true },
      disposition: 0
    },
    flags: {
      [MODULE_ID]: {
        imported: true,
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { actorData, warnings };
}
