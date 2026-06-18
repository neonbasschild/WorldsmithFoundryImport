/**
 * Foundry runtime glue around the pure converters. These helpers actually
 * create the documents and surface notifications, so they are only ever called
 * from inside a running Foundry world.
 */

import { MODULE_ID } from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";
import { convertWorldsmithItem } from "./item-converter.mjs";
import { convertWorldsmithShop, convertWorldsmithTreasure } from "./shop-converter.mjs";
import { convertWorldsmithQuest } from "./journal-converter.mjs";
import { convertWorldsmithSpell } from "./spell-converter.mjs";
import { convertWorldsmithFeat } from "./feat-converter.mjs";
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
 * Create an Item Piles merchant actor (plus owner actors) from a Worldsmith shop.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[]}>}
 */
export async function createShopFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { merchant, owners, warnings } = convertWorldsmithShop(data);
  const folder = resolveFolder(folderId, "Actor");
  if (folder) {
    merchant.folder = folder;
    for (const owner of owners) owner.folder = folder;
  }

  const actors = [];
  const merchantActor = await Actor.create(merchant, { renderSheet });
  if (merchantActor) actors.push(merchantActor);
  for (const owner of owners) {
    const ownerActor = await Actor.create(owner);
    if (ownerActor) actors.push(ownerActor);
  }
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${merchant.name}: ${warning}`);
  return { actors, items: [] };
}

/**
 * Create an Item Piles loot pile actor from a Worldsmith treasure export.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[]}>}
 */
export async function createTreasureFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { pile, warnings } = convertWorldsmithTreasure(data);
  const folder = resolveFolder(folderId, "Actor");
  if (folder) pile.folder = folder;

  const pileActor = await Actor.create(pile, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${pile.name}: ${warning}`);
  return { actors: pileActor ? [pileActor] : [], items: [] };
}

/**
 * Create a dnd5e spell item from a parsed Worldsmith spell object.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Item|null>}
 */
export async function createSpellFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { itemData, warnings } = convertWorldsmithSpell(data);
  const folder = resolveFolder(folderId, "Item");
  if (folder) itemData.folder = folder;

  const item = await Item.create(itemData, { renderSheet });
  if (!item) return null;
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${item.name}: ${warning}`);
  return item;
}

/**
 * Create a dnd5e feat item from a parsed Worldsmith feat object.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Item|null>}
 */
export async function createFeatFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { itemData, warnings } = convertWorldsmithFeat(data);
  const folder = resolveFolder(folderId, "Item");
  if (folder) itemData.folder = folder;

  const item = await Item.create(itemData, { renderSheet });
  if (!item) return null;
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${item.name}: ${warning}`);
  return item;
}

/**
 * Create a JournalEntry from a Worldsmith quest export.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
 */
export async function createJournalFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { journalData, warnings } = convertWorldsmithQuest(data);
  const folder = resolveFolder(folderId, "JournalEntry");
  if (folder) journalData.folder = folder;

  const journal = await JournalEntry.create(journalData, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${journalData.name}: ${warning}`);
  return { actors: [], items: [], journals: journal ? [journal] : [] };
}

/**
 * Create the appropriate document(s) from a Worldsmith export.
 * @param {object} data
 * @param {object} [options]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
 */
export async function createFromWorldsmith(data, options = {}) {
  const type = detectWorldsmithType(data);
  if (type === "shop") return createShopFromWorldsmith(data, options);
  if (type === "treasure") return createTreasureFromWorldsmith(data, options);
  if (type === "quest") return createJournalFromWorldsmith(data, options);
  if (type === "spell") {
    const spell = await createSpellFromWorldsmith(data, options);
    return { actors: [], items: spell ? [spell] : [] };
  }
  if (type === "feat") {
    const feat = await createFeatFromWorldsmith(data, options);
    return { actors: [], items: feat ? [feat] : [] };
  }
  if (type === "item") {
    const item = await createItemFromWorldsmith(data, options);
    return { actors: [], items: item ? [item] : [] };
  }
  const actor = await createActorFromWorldsmith(data, options);
  return { actors: actor ? [actor] : [], items: [] };
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
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
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
  const journals = [];
  for (const entry of entries) {
    const result = await createFromWorldsmith(entry, options);
    actors.push(...(result.actors ?? []));
    items.push(...(result.items ?? []));
    journals.push(...(result.journals ?? []));
  }
  return { actors, items, journals };
}
