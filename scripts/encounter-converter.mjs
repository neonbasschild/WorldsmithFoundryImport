/**
 * Pure conversion logic that turns a Worldsmith *encounter* export into the
 * data needed to create a dnd5e encounter group Actor in Foundry VTT.
 * Foundry-runtime free so it can be unit-tested in plain Node.
 */

import { MODULE_ID } from "./constants.mjs";
import { escapeHTML, textToHTML } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";
const ENCOUNTER_ICON = "systems/dnd5e/icons/svg/actors/encounter.svg";

/**
 * Convert a Worldsmith encounter export into Foundry encounter Actor creation data.
 * Member UUIDs are populated at import time after the member NPCs are created.
 * @param {object} data  Parsed Worldsmith encounter JSON.
 * @returns {{
 *   encounterData: object,
 *   memberSources: object[],
 *   items: object[],
 *   treasures: object[],
 *   spells: object[],
 *   feats: object[],
 *   warnings: string[]
 * }}
 */
export function convertWorldsmithEncounter(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith encounter data must be an object.");
  }
  const encounter = data.data && typeof data.data === "object" ? data.data : data;

  const descriptionParts = [];
  if (encounter.subtitle) descriptionParts.push(`<p><em>${escapeHTML(encounter.subtitle)}</em></p>`);
  if (encounter.set_the_scene) {
    descriptionParts.push(`<h2>Set the Scene</h2>${textToHTML(encounter.set_the_scene)}`);
  }
  if (encounter.objective) {
    descriptionParts.push(`<h2>Objective</h2>${textToHTML(encounter.objective)}`);
  }
  if (encounter.key_features) {
    descriptionParts.push(`<h2>Key Features</h2>${textToHTML(encounter.key_features)}`);
  }

  const encounterData = {
    name: encounter.name || "Imported Encounter",
    type: "encounter",
    img: ENCOUNTER_ICON,
    system: {
      description: {
        full: descriptionParts.join(""),
        summary: encounter.subtitle ?? ""
      },
      members: [],
      details: {
        xp: { value: 0 }
      },
      source: { custom: "Imported from Worldsmith" }
    },
    prototypeToken: {
      name: encounter.name || "Imported Encounter",
      actorLink: true
    },
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "encounter",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return {
    encounterData,
    memberSources: encounter.members ?? [],
    items: encounter.items ?? [],
    treasures: encounter.treasures ?? [],
    spells: encounter.spells ?? [],
    feats: encounter.feats ?? [],
    warnings
  };
}
