/**
 * Foundry runtime glue around the pure converters. These helpers actually
 * create the documents and surface notifications, so they are only ever called
 * from inside a running Foundry world.
 */

import { MODULE_ID } from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";
import { convertWorldsmithItem } from "./item-converter.mjs";
import { detectWorldsmithType } from "./detect.mjs";

/**
 * Resolve a folder id to apply, only when it matches the document type.
 * @param {string|null} folderId
 * @param {"Actor"|"Item"} documentType
 * @returns {string|null}
 */
function resolveFolder(folderId, documentType) {
  if (!folderId) return null;
  const folder = game.folders?.get(folderId);
  return folder?.type === documentType ? folderId : null;
}

/**
 * Create a single dnd5e NPC actor from a parsed Worldsmith creature object.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Actor|null>}
 */
export async function createActorFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { actorData, warnings } = convertWorldsmith(data);
  const folder = resolveFolder(folderId, "Actor");
  if (folder) actorData.folder = folder;

  const actor = await Actor.create(actorData, { renderSheet });
  if (!actor) return null;
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${actor.name}: ${warning}`);
  return actor;
}

/**
 * Create a single dnd5e item from a parsed Worldsmith item object.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Item|null>}
 */
export async function createItemFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { itemData, warnings } = convertWorldsmithItem(data);
  const folder = resolveFolder(folderId, "Item");
  if (folder) itemData.folder = folder;

  const item = await Item.create(itemData, { renderSheet });
  if (!item) return null;
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${item.name}: ${warning}`);
  return item;
}

/**
 * Create the appropriate document (actor or item) from a Worldsmith export.
 * @param {object} data
 * @param {object} [options]
 * @returns {Promise<{document: (Actor|Item|null), type: "creature"|"item"}>}
 */
export async function createFromWorldsmith(data, options = {}) {
  const type = detectWorldsmithType(data);
  const document = type === "item"
    ? await createItemFromWorldsmith(data, options)
    : await createActorFromWorldsmith(data, options);
  return { document, type };
}

/**
 * Parse and import one or more Worldsmith entries from a JSON string. The string
 * may contain a single object or an array of objects, and may mix creatures and
 * items.
 * @param {string} text
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @param {string} [options.label]
 * @returns {Promise<{actors: Actor[], items: Item[]}>}
 */
export async function importFromText(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${options.label ? `${options.label}: ` : ""}Invalid JSON \u2013 ${err.message}`);
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const actors = [];
  const items = [];
  for (const entry of entries) {
    const { document, type } = await createFromWorldsmith(entry, options);
    if (!document) continue;
    if (type === "item") items.push(document);
    else actors.push(document);
  }
  return { actors, items };
}
