/**
 * Heuristics for distinguishing the different Worldsmith export shapes so the
 * importer can route each entry to the correct converter.
 */

/**
 * Determine whether a parsed Worldsmith export describes a shop, treasure,
 * quest, creature, or item.
 * @param {object} data
 * @returns {"shop"|"treasure"|"quest"|"creature"|"item"}
 */
export function detectWorldsmithType(data) {
  if (!data || typeof data !== "object") return "creature";

  // Shops carry inventory/services/owners collections.
  if (
    data.standard_items !== undefined
    || data.magic_items !== undefined
    || data.services !== undefined
    || data.owners !== undefined
  ) return "shop";

  // Treasure / loot piles carry currency and basic/notable item collections.
  if (
    data.basic_items !== undefined
    || data.notable_items !== undefined
    || data.currency !== undefined
  ) return "treasure";

  // Quests carry a GM overview, hook, objectives, or resolution.
  if (
    data.gm_overview !== undefined
    || data.hook !== undefined
    || data.objectives !== undefined
    || data.resolution !== undefined
  ) return "quest";

  // Creatures carry an identity/attributes/abilities block.
  if (data.identity || data.attributes || data.abilities) return "creature";

  // Items carry a category, weapon/armor data, rarity, or usage block.
  if (
    data.category !== undefined
    || data.weaponData !== undefined
    || data.armorData !== undefined
    || data.rarity !== undefined
    || data.usage !== undefined
  ) return "item";

  return "creature";
}
