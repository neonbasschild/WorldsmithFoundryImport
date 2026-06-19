/**
 * Pure conversion logic that turns a Worldsmith *roll table* export into the
 * data needed to create a Foundry RollTable. Foundry-runtime free so it can be
 * unit-tested in plain Node.
 */

import { MODULE_ID } from "./constants.mjs";
import { escapeHTML, textToHTML } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";
const TABLE_ICON = "icons/svg/d20-grey.svg";
const RESULT_ICON = "systems/dnd5e/icons/svg/dice/d20.svg";

/**
 * Convert a Worldsmith roll table export into Foundry RollTable creation data.
 * @param {object} data  Parsed Worldsmith roll table JSON.
 * @returns {{tableData: object, warnings: string[]}}
 */
export function convertWorldsmithRollTable(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith roll table data must be an object.");
  }
  const table = data.data && typeof data.data === "object" ? data.data : data;

  const results = (table.results ?? []).map((entry, index) => {
    const [min, max] = entry.range ?? [index + 1, index + 1];
    const text = entry.text ?? "";
    return {
      type: "text",
      weight: Math.max(1, max - min + 1),
      range: [min, max],
      name: "",
      img: RESULT_ICON,
      text,
      description: text ? textToHTML(text) : "",
      drawn: false,
      flags: {}
    };
  });

  if (!results.length) {
    warnings.push("Roll table has no results.");
  }

  let formula = table.formula ?? "";
  if (!formula && results.length) {
    const high = Math.max(...results.map(r => r.range?.[1] ?? 0));
    if (high > 0) formula = `1d${high}`;
  }

  const descriptionParts = [];
  if (table.subtitle) descriptionParts.push(`<p><em>${escapeHTML(table.subtitle)}</em></p>`);
  if (table.description) descriptionParts.push(textToHTML(table.description));

  const tableData = {
    name: table.name || "Imported Roll Table",
    img: TABLE_ICON,
    description: descriptionParts.join(""),
    formula,
    replacement: true,
    displayRoll: true,
    results,
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: "rollTable",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { tableData, warnings };
}
