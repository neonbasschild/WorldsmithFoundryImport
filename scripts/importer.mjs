/**
 * Foundry runtime glue around the pure converters. These helpers actually
 * create the documents and surface notifications, so they are only ever called
 * from inside a running Foundry world.
 */

import { MODULE_ID } from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";
import { convertWorldsmithItem } from "./item-converter.mjs";
import {
  convertMundaneShopItem, convertServiceItem, convertWorldsmithShop, convertWorldsmithTreasure,
  withPileItemFlag
} from "./shop-converter.mjs";
import { convertWorldsmithQuest } from "./journal-converter.mjs";
import { convertWorldsmithEncounter } from "./encounter-converter.mjs";
import { convertWorldsmithGroup } from "./group-converter.mjs";
import { convertWorldsmithRollTable } from "./table-converter.mjs";
import { convertWorldsmithSpell } from "./spell-converter.mjs";
import { convertWorldsmithFeat } from "./feat-converter.mjs";
import { detectWorldsmithType } from "./detect.mjs";
import { normalizeWorldsmithData } from "./worldsmith-parser.mjs";
import {
  clearSrdLookupCache, findSrdMatch, getSrdItemCreateData, importSrdCompendiumItem,
  readWorldsmithItemName
} from "./srd-lookup.mjs";

/**
 * @param {string} name
 * @param {string} packId
 */
function logSrdImport(name, packId) {
  console.log(`${MODULE_ID} | ${name}: imported from SRD compendium (${packId})`);
}

/**
 * Import embedded spells, feats, and items from a narrative or combat document.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @returns {Promise<Item[]>}
 */
async function importEmbeddedContentItems(data, { folderId = null } = {}) {
  const items = [];
  const itemFolder = resolveFolder(folderId, "Item");

  for (const itemSource of data.items ?? []) {
    const item = await createItemFromWorldsmith(itemSource, { folderId: itemFolder, renderSheet: false });
    if (item) items.push(item);
  }

  for (const spellSource of data.spells ?? []) {
    const spell = await createSpellFromWorldsmith(spellSource, { folderId: itemFolder, renderSheet: false });
    if (spell) items.push(spell);
  }

  for (const featSource of data.feats ?? []) {
    const feat = await createFeatFromWorldsmith(featSource, { folderId: itemFolder, renderSheet: false });
    if (feat) items.push(feat);
  }

  return items;
}

/**
 * Build shop inventory items, preferring SRD compendium matches when available.
 * @param {object} data
 * @returns {Promise<{items: object[], warnings: string[]}>}
 */
async function buildShopEmbeddedItems(data) {
  const items = [];
  const warnings = [];

  for (const entry of data.standard_items ?? []) {
    try {
      const match = await findSrdMatch(entry);
      if (match) {
        const itemData = await getSrdItemCreateData(match);
        if (itemData) {
          logSrdImport(entry.item ?? entry.name, match.packId);
          items.push(withPileItemFlag(itemData));
          continue;
        }
      }
      items.push(withPileItemFlag(convertMundaneShopItem(entry)));
    } catch (err) {
      warnings.push(`Skipped a standard item: ${err.message}`);
    }
  }

  for (const wrapper of data.magic_items ?? []) {
    const itemSource = wrapper?.data ?? wrapper;
    try {
      const match = await findSrdMatch(itemSource);
      if (match) {
        const itemData = await getSrdItemCreateData(match);
        if (itemData) {
          logSrdImport(readWorldsmithItemName(itemSource), match.packId);
          items.push(withPileItemFlag(itemData));
          continue;
        }
      }
      const { itemData, warnings: itemWarnings } = convertWorldsmithItem(itemSource);
      warnings.push(...itemWarnings);
      items.push(withPileItemFlag(itemData));
    } catch (err) {
      warnings.push(`Skipped a magic item: ${err.message}`);
    }
  }

  for (const entry of data.services ?? []) {
    items.push(convertServiceItem(entry));
  }

  return { items, warnings };
}

/**
 * Build treasure pile inventory items, preferring SRD compendium matches when available.
 * @param {object} data
 * @returns {Promise<{items: object[], warnings: string[]}>}
 */
async function buildTreasureEmbeddedItems(data) {
  const items = [];
  const warnings = [];

  for (const entry of data.basic_items ?? []) {
    try {
      const match = await findSrdMatch(entry);
      if (match) {
        const itemData = await getSrdItemCreateData(match);
        if (itemData) {
          logSrdImport(entry.item ?? entry.name, match.packId);
          items.push(withPileItemFlag(itemData));
          continue;
        }
      }
      items.push(withPileItemFlag(convertMundaneShopItem(entry)));
    } catch (err) {
      warnings.push(`Skipped a basic item: ${err.message}`);
    }
  }

  for (const wrapper of data.notable_items ?? []) {
    const itemSource = wrapper?.data ?? wrapper;
    try {
      const match = await findSrdMatch(itemSource);
      if (match) {
        const itemData = await getSrdItemCreateData(match);
        if (itemData) {
          logSrdImport(readWorldsmithItemName(itemSource), match.packId);
          if (wrapper?.quantity !== undefined) {
            itemData.system ??= {};
            itemData.system.quantity = wrapper.quantity;
          }
          items.push(withPileItemFlag(itemData));
          continue;
        }
      }
      const { itemData, warnings: itemWarnings } = convertWorldsmithItem(itemSource);
      warnings.push(...itemWarnings);
      if (wrapper?.quantity !== undefined) itemData.system.quantity = wrapper.quantity;
      items.push(withPileItemFlag(itemData));
    } catch (err) {
      warnings.push(`Skipped a notable item: ${err.message}`);
    }
  }

  return { items, warnings };
}

/**
 * Resolve a folder id to apply, only when it matches the document type.
 * @param {string|null} folderId
 * @param {"Actor"|"Item"|"JournalEntry"|"RollTable"} documentType
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
  const srdMatch = await findSrdMatch(data);
  if (srdMatch) {
    const item = await importSrdCompendiumItem(srdMatch, { folderId, renderSheet });
    if (item) {
      logSrdImport(readWorldsmithItemName(data), srdMatch.packId);
      return item;
    }
  }

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
  const embedded = await buildShopEmbeddedItems(data);
  merchant.items = embedded.items;
  warnings.push(...embedded.warnings);
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
  const embedded = await buildTreasureEmbeddedItems(data);
  pile.items = embedded.items;
  warnings.push(...embedded.warnings);
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
  const srdMatch = await findSrdMatch(data);
  if (srdMatch) {
    const item = await importSrdCompendiumItem(srdMatch, { folderId, renderSheet });
    if (item) {
      logSrdImport(readWorldsmithItemName(data), srdMatch.packId);
      return item;
    }
  }

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
  const srdMatch = await findSrdMatch(data);
  if (srdMatch) {
    const item = await importSrdCompendiumItem(srdMatch, { folderId, renderSheet });
    if (item) {
      logSrdImport(readWorldsmithItemName(data), srdMatch.packId);
      return item;
    }
  }

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

  const actors = [];
  const actorFolder = resolveFolder(folderId, "Actor");
  for (const actorSource of data.actors ?? []) {
    const { actorData, warnings: actorWarnings } = convertWorldsmith(actorSource);
    if (actorFolder) actorData.folder = actorFolder;
    const actor = await Actor.create(actorData);
    if (actor) actors.push(actor);
    for (const warning of actorWarnings) console.warn(`${MODULE_ID} | ${actorData.name}: ${warning}`);
  }

  for (const treasureSource of data.treasures ?? []) {
    const result = await createTreasureFromWorldsmith(treasureSource, { folderId: actorFolder, renderSheet: false });
    actors.push(...(result.actors ?? []));
  }

  const items = await importEmbeddedContentItems(data, { folderId });

  return { actors, items, journals: journal ? [journal] : [] };
}

/**
 * Create a dnd5e encounter group actor plus its member NPCs from a Worldsmith export.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
 */
export async function createEncounterFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const {
    encounterData, memberSources, items: itemSources, treasures, spells, feats, warnings
  } = convertWorldsmithEncounter(data);

  const actorFolder = resolveFolder(folderId, "Actor");
  const memberActors = [];
  const members = [];

  for (const source of memberSources) {
    const { actorData, warnings: actorWarnings } = convertWorldsmith(source);
    if (actorFolder) actorData.folder = actorFolder;
    const actor = await Actor.create(actorData);
    if (actor) {
      memberActors.push(actor);
      members.push({
        uuid: actor.uuid,
        quantity: { value: source.quantity ?? 1, formula: "" }
      });
    }
    for (const warning of actorWarnings) console.warn(`${MODULE_ID} | ${actorData.name}: ${warning}`);
  }

  encounterData.system.members = members;
  if (actorFolder) encounterData.folder = actorFolder;

  const encounter = await Actor.create(encounterData, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${encounterData.name}: ${warning}`);

  const actors = [];
  if (encounter) actors.push(encounter);
  actors.push(...memberActors);

  for (const treasureSource of treasures ?? []) {
    const result = await createTreasureFromWorldsmith(treasureSource, { folderId: actorFolder, renderSheet: false });
    actors.push(...(result.actors ?? []));
  }

  const items = await importEmbeddedContentItems({ items: itemSources, spells, feats }, { folderId });

  return { actors, items, journals: [] };
}

/**
 * Create a dnd5e group actor plus its member NPCs from a Worldsmith export.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
 */
export async function createGroupFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const {
    groupData, memberSources, items: itemSources, treasures, spells, feats, warnings
  } = convertWorldsmithGroup(data);

  const actorFolder = resolveFolder(folderId, "Actor");
  const memberActors = [];
  const members = [];

  for (const source of memberSources) {
    const { actorData, warnings: actorWarnings } = convertWorldsmith(source);
    if (actorFolder) actorData.folder = actorFolder;
    const actor = await Actor.create(actorData);
    if (actor) {
      memberActors.push(actor);
      members.push({ actor: actor.id });
    }
    for (const warning of actorWarnings) console.warn(`${MODULE_ID} | ${actorData.name}: ${warning}`);
  }

  groupData.system.members = members;
  if (actorFolder) groupData.folder = actorFolder;

  const group = await Actor.create(groupData, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${groupData.name}: ${warning}`);

  const actors = [];
  if (group) actors.push(group);
  actors.push(...memberActors);

  for (const treasureSource of treasures ?? []) {
    const result = await createTreasureFromWorldsmith(treasureSource, { folderId: actorFolder, renderSheet: false });
    actors.push(...(result.actors ?? []));
  }

  const items = await importEmbeddedContentItems({ items: itemSources, spells, feats }, { folderId });

  return { actors, items, journals: [] };
}

/**
 * Create a dungeon journal entry, room encounter groups, and embedded items.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[]}>}
 */
export async function createDungeonFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { journalData, warnings } = convertWorldsmithQuest(data);
  const folder = resolveFolder(folderId, "JournalEntry");
  if (folder) journalData.folder = folder;

  const journal = await JournalEntry.create(journalData, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${journalData.name}: ${warning}`);

  const actors = [];
  const items = [];
  for (const encounterSource of data.encounters ?? []) {
    const result = await createEncounterFromWorldsmith(encounterSource, { folderId, renderSheet: false });
    actors.push(...(result.actors ?? []));
    items.push(...(result.items ?? []));
  }

  return { actors, items, journals: journal ? [journal] : [] };
}

/**
 * Create a RollTable from a Worldsmith roll table export.
 * @param {object} data
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[], tables: RollTable[]}>}
 */
export async function createRollTableFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { tableData, warnings } = convertWorldsmithRollTable(data);
  const folder = resolveFolder(folderId, "RollTable");
  if (folder) tableData.folder = folder;

  const table = await RollTable.create(tableData, { renderSheet });
  for (const warning of warnings) console.warn(`${MODULE_ID} | ${tableData.name}: ${warning}`);

  const actors = [];
  const actorFolder = resolveFolder(folderId, "Actor");
  for (const actorSource of data.actors ?? []) {
    const { actorData, warnings: actorWarnings } = convertWorldsmith(actorSource);
    if (actorFolder) actorData.folder = actorFolder;
    const actor = await Actor.create(actorData);
    if (actor) actors.push(actor);
    for (const warning of actorWarnings) console.warn(`${MODULE_ID} | ${actorData.name}: ${warning}`);
  }

  const items = await importEmbeddedContentItems(data, { folderId });

  return { actors, items, journals: [], tables: table ? [table] : [] };
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
  if (type === "world") return createJournalFromWorldsmith(data, options);
  if (type === "session") return createJournalFromWorldsmith(data, options);
  if (type === "deity") return createJournalFromWorldsmith(data, options);
  if (type === "encounter") return createEncounterFromWorldsmith(data, options);
  if (type === "group") return createGroupFromWorldsmith(data, options);
  if (type === "dungeon") return createDungeonFromWorldsmith(data, options);
  if (type === "puzzle") return createJournalFromWorldsmith(data, options);
  if (type === "trap") return createJournalFromWorldsmith(data, options);
  if (type === "rollTable") return createRollTableFromWorldsmith(data, options);
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
 * @returns {Promise<{actors: Actor[], items: Item[], journals: JournalEntry[], tables: RollTable[]}>}
 */
export async function importFromText(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${options.label ? `${options.label}: ` : ""}Invalid JSON \u2013 ${err.message}`);
  }

  clearSrdLookupCache();
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const actors = [];
  const items = [];
  const journals = [];
  const tables = [];
  try {
    for (const entry of entries) {
      const result = await createFromWorldsmith(normalizeWorldsmithData(entry), options);
      actors.push(...(result.actors ?? []));
      items.push(...(result.items ?? []));
      journals.push(...(result.journals ?? []));
      tables.push(...(result.tables ?? []));
    }
  } finally {
    clearSrdLookupCache();
  }
  return { actors, items, journals, tables };
}
