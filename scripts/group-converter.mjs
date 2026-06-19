/**
 * Pure conversion logic that turns a Worldsmith *group* export into the data
 * needed to create a dnd5e party/faction group Actor in Foundry VTT.
 * Foundry-runtime free so it can be unit-tested in plain Node.
 */

import { MODULE_ID } from "./constants.mjs";
import { escapeHTML, textToHTML } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";
const GROUP_ICON = "systems/dnd5e/icons/svg/actors/group.svg";

/** @type {Array<[string, string]>} */
const GROUP_DESCRIPTION_SECTIONS = [
  ["overview", "Overview"],
  ["basic_information", "Basic Information"],
  ["goals", "Goals"],
  ["resources", "Resources"],
  ["membership_requirements", "Membership Requirements"],
  ["organization_structure", "Organization Structure"],
  ["prominent_figures", "Prominent Figures"]
];

/**
 * Convert a Worldsmith group export into Foundry group Actor creation data.
 * Member actor ids are populated at import time after member NPCs are created.
 * @param {object} data  Parsed Worldsmith group JSON.
 * @returns {{
 *   groupData: object,
 *   memberSources: object[],
 *   items: object[],
 *   treasures: object[],
 *   spells: object[],
 *   feats: object[],
 *   warnings: string[]
 * }}
 */
export function convertWorldsmithGroup(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith group data must be an object.");
  }
  const group = data.data && typeof data.data === "object" ? data.data : data;

  const descriptionParts = [];
  if (group.subtitle) descriptionParts.push(`<p><em>${escapeHTML(group.subtitle)}</em></p>`);
  for (const [field, title] of GROUP_DESCRIPTION_SECTIONS) {
    const content = group[field];
    if (content) descriptionParts.push(`<h2>${title}</h2>${textToHTML(content)}`);
  }

  const groupData = {
    name: group.name || "Imported Group",
    type: "group",
    img: GROUP_ICON,
    system: {
      description: {
        full: descriptionParts.join(""),
        summary: group.subtitle ?? ""
      },
      members: [],
      source: { custom: "Imported from Worldsmith" }
    },
    prototypeToken: {
      name: group.name || "Imported Group",
      actorLink: true
    },
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "group",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return {
    groupData,
    memberSources: group.members ?? [],
    items: group.items ?? [],
    treasures: group.treasures ?? [],
    spells: group.spells ?? [],
    feats: group.feats ?? [],
    warnings
  };
}
