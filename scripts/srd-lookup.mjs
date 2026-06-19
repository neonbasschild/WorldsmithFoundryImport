/**
 * Resolve Worldsmith spell, feat, and item names against the dnd5e system's SRD
 * compendiums before falling back to custom item creation.
 *
 * Foundry-runtime only — requires game.packs from a loaded dnd5e world.
 */

/** @type {Map<string, object|null>} */
const packCache = new Map();

/**
 * dnd5e compendium packs to search for spells, highest priority first.
 * @type {string[]}
 */
export const SPELL_COMPENDIUM_PACKS = [
  "dnd5e.spells24",
  "dnd5e.spells"
];

/**
 * dnd5e compendium packs to search for feats, highest priority first.
 * @type {string[]}
 */
export const FEAT_COMPENDIUM_PACKS = [
  "dnd5e.feats24",
  "dnd5e.feats",
  "dnd5e.origins24",
  "dnd5e.classes24",
  "dnd5e.backgrounds",
  "dnd5e.classfeatures",
  "dnd5e.races",
  "dnd5e.monsterfeatures",
  "dnd5e.monsterfeatures24"
];

/**
 * dnd5e compendium packs to search for equipment and magic items.
 * @type {string[]}
 */
export const ITEM_COMPENDIUM_PACKS = [
  "dnd5e.equipment24",
  "dnd5e.equipment",
  "dnd5e.items"
];

/**
 * Item document types to search within equipment compendiums.
 * @type {string[]}
 */
export const ITEM_DOCUMENT_TYPES = [
  "weapon",
  "equipment",
  "consumable",
  "tool",
  "loot",
  "container",
  "backpack"
];

/**
 * Normalize a spell/feat/item name for compendium lookup.
 * @param {string} name
 * @returns {string}
 */
export function normalizeSrdName(name) {
  return String(name ?? "")
    .replace(/^(?:Spell|Feat|Magic Item):\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Extract a spell name from a scroll item label.
 * @param {string} name
 * @returns {string|null}
 */
export function parseScrollSpellName(name) {
  const match = String(name ?? "").match(/spell\s+scroll\s*(?:\(\s*([^)]+)\s*\)|:\s*(.+))$/i);
  return match?.[1]?.trim() || match?.[2]?.trim() || null;
}

/**
 * Read the best display name from a Worldsmith item-like object or shop row.
 * @param {object|null|undefined} data
 * @returns {string}
 */
export function readWorldsmithItemName(data) {
  if (!data || typeof data !== "object") return "";
  return String(data.name ?? data.item ?? "").trim();
}

/**
 * @param {string} name
 * @returns {string}
 */
function slugifySrdName(name) {
  return normalizeSrdName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * @param {object} entry
 * @returns {string}
 */
function readIndexIdentifier(entry) {
  return String(entry?.system?.identifier ?? entry?.["system.identifier"] ?? "").toLowerCase();
}

/**
 * @param {object} pack
 * @param {string} name
 * @param {string|string[]} documentType
 * @returns {object|null}
 */
function findIndexEntry(pack, name, documentType) {
  const normalized = normalizeSrdName(name);
  const slug = slugifySrdName(name);
  const types = Array.isArray(documentType) ? documentType : [documentType];

  for (const type of types) {
    const byName = pack.index.find(entry =>
      entry.type === type && normalizeSrdName(entry.name) === normalized
    );
    if (byName) return byName;
  }

  if (!slug) return null;

  for (const type of types) {
    const bySlug = pack.index.find(entry =>
      entry.type === type && readIndexIdentifier(entry) === slug
    );
    if (bySlug) return bySlug;
  }

  return null;
}

/**
 * @param {string} packId
 * @returns {Promise<object|null>}
 */
async function getIndexedPack(packId) {
  if (packCache.has(packId)) return packCache.get(packId) ?? null;

  const pack = game.packs.get(packId);
  if (!pack) {
    packCache.set(packId, null);
    return null;
  }

  if (!pack.index.size) await pack.getIndex();
  packCache.set(packId, pack);
  return pack;
}

/**
 * @param {string} name
 * @param {string[]} packIds
 * @param {string|string[]} documentType
 * @returns {Promise<{pack: object, entry: object, packId: string}|null>}
 */
async function findInCompendiumPacks(name, packIds, documentType) {
  if (!name || typeof game === "undefined" || game.system?.id !== "dnd5e") return null;

  for (const packId of packIds) {
    const pack = await getIndexedPack(packId);
    if (!pack) continue;
    const entry = findIndexEntry(pack, name, documentType);
    if (entry) return { pack, entry, packId };
  }
  return null;
}

/**
 * Find a matching SRD spell in dnd5e compendiums.
 * @param {string} name
 * @returns {Promise<{pack: object, entry: object, packId: string}|null>}
 */
export async function findSrdSpell(name) {
  return findInCompendiumPacks(name, SPELL_COMPENDIUM_PACKS, "spell");
}

/**
 * Find a matching SRD feat in dnd5e compendiums.
 * @param {string} name
 * @returns {Promise<{pack: object, entry: object, packId: string}|null>}
 */
export async function findSrdFeat(name) {
  return findInCompendiumPacks(name, FEAT_COMPENDIUM_PACKS, "feat");
}

/**
 * Find a matching SRD item in dnd5e equipment compendiums.
 * @param {string} name
 * @returns {Promise<{pack: object, entry: object, packId: string}|null>}
 */
export async function findSrdItem(name) {
  return findInCompendiumPacks(name, ITEM_COMPENDIUM_PACKS, ITEM_DOCUMENT_TYPES);
}

/**
 * Pick the best SRD compendium match for a Worldsmith item-like export.
 * @param {object|null|undefined} data
 * @returns {Promise<{pack: object, entry: object, packId: string}|null>}
 */
export async function findSrdMatch(data) {
  const name = readWorldsmithItemName(data);
  if (!name) return null;

  if (data?.castingTime !== undefined || (data?.school !== undefined && data?.level !== undefined)) {
    return await findSrdSpell(name);
  }

  if (data?.mechanics !== undefined || data?.prerequisites !== undefined) {
    return await findSrdFeat(name);
  }

  if (/^spell:/i.test(name)) {
    const match = await findSrdSpell(name);
    if (match) return match;
  }

  if (/^feat:/i.test(name)) {
    const match = await findSrdFeat(name);
    if (match) return match;
  }

  if (/^magic item:/i.test(name)) {
    const stripped = name.replace(/^Magic Item:\s*/i, "").trim();
    const match = await findSrdItem(stripped) ?? await findSrdItem(name);
    if (match) return match;
  }

  const scrollSpell = parseScrollSpellName(name);
  if (scrollSpell) {
    const scrollItem = await findSrdItem(name);
    if (scrollItem) return scrollItem;
    const spell = await findSrdSpell(scrollSpell);
    if (spell) return spell;
  }

  return await findSrdItem(name)
    ?? await findSrdSpell(name)
    ?? await findSrdFeat(name);
}

/**
 * Load compendium item data suitable for Item.create or actor embedding.
 * @param {{pack: object, entry: object}} match
 * @returns {Promise<object|null>}
 */
export async function getSrdItemCreateData(match) {
  const source = await match.pack.getDocument(match.entry._id);
  if (!source) return null;
  const data = source.toObject();
  delete data._id;
  return data;
}

/**
 * Import a compendium index match into the world as an Item.
 * @param {{pack: object, entry: object}} match
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Item|null>}
 */
export async function importSrdCompendiumItem(match, { folderId = null, renderSheet = false } = {}) {
  const itemData = await getSrdItemCreateData(match);
  if (!itemData) return null;

  if (folderId) {
    const folder = game.folders?.get(folderId);
    if (folder?.type === "Item") itemData.folder = folderId;
  }

  const item = await Item.create(itemData, { renderSheet });
  if (renderSheet) item?.sheet?.render(true);
  return item;
}

/**
 * Drop cached compendium indexes between import batches.
 */
export function clearSrdLookupCache() {
  packCache.clear();
}
