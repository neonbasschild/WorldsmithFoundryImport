/**
 * Heuristics for distinguishing the different Worldsmith export shapes so the
 * importer can route each entry to the correct converter.
 */

/**
 * Determine whether a parsed Worldsmith export describes a creature or an item.
 * @param {object} data
 * @returns {"creature"|"item"}
 */
export function detectWorldsmithType(data) {
  if (!data || typeof data !== "object") return "creature";

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
