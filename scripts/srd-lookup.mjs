/**
 * Resolve Worldsmith spell and feat names against the dnd5e system's SRD
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
  "dnd5e.items",
  "dnd5e.origins24",
  "dnd5e.classes24",
  "dnd5e.backgrounds",
  "dnd5e.classfeatures",
  "dnd5e.races",
  "dnd5e.equipment24",
  "dnd5e.monsterfeatures",
  "dnd5e.monsterfeatures24"
];

/**
 * Normalize a spell/feat name for compendium lookup.
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
 * @param {string} documentType
 * @returns {object|null}
 */
function findIndexEntry(pack, name, documentType) {
  const normalized = normalizeSrdName(name);
  const slug = slugifySrdName(name);

  const byName = pack.index.find(entry =>
    entry.type === documentType && normalizeSrdName(entry.name) === normalized
  );
  if (byName) return byName;

  if (!slug) return null;
  return pack.index.find(entry =>
    entry.type === documentType && readIndexIdentifier(entry) === slug
  ) ?? null;
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
 * @param {string} documentType
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
 * Import a compendium index match into the world as an Item.
 * @param {{pack: object, entry: object}} match
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Item|null>}
 */
export async function importSrdCompendiumItem(match, { folderId = null, renderSheet = false } = {}) {
  const { pack, entry } = match;
  const source = await pack.getDocument(entry._id);
  if (!source) return null;

  let item;
  if (typeof pack.importDocument === "function") {
    item = await pack.importDocument(source, { keepId: false });
  } else {
    const data = source.toObject();
    delete data._id;
    item = await Item.create(data, { renderSheet });
  }

  if (!item) return null;

  if (folderId) {
    const folder = game.folders?.get(folderId);
    if (folder?.type === "Item" && item.folder?.id !== folderId) {
      await item.update({ folder: folderId });
    }
  }

  if (renderSheet) item.sheet?.render(true);
  return item;
}

/**
 * Drop cached compendium indexes between import batches.
 */
export function clearSrdLookupCache() {
  packCache.clear();
}
