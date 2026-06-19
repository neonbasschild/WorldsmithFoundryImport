/**
 * Heuristics for distinguishing the different Worldsmith export shapes so the
 * importer can route each entry to the correct converter.
 */

/**
 * Determine whether a parsed Worldsmith export describes a shop, treasure,
 * quest, spell, feat, creature, or item.
 * @param {object} data
 * @returns {"shop"|"treasure"|"quest"|"session"|"deity"|"encounter"|"group"|"dungeon"|"puzzle"|"spell"|"feat"|"creature"|"item"}
 */
export function detectWorldsmithType(data) {
  if (!data || typeof data !== "object") return "creature";

  if (data.documentKind === "session") return "session";
  if (data.documentKind === "deity") return "deity";
  if (data.documentKind === "encounter") return "encounter";
  if (data.documentKind === "group") return "group";
  if (data.documentKind === "dungeon") return "dungeon";
  if (data.documentKind === "puzzle") return "puzzle";

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

  // Spells carry a casting time, or a school together with a level.
  if (
    data.castingTime !== undefined
    || (data.school !== undefined && data.level !== undefined)
  ) return "spell";

  // Feats carry mechanics and/or a prerequisites list.
  if (data.mechanics !== undefined || data.prerequisites !== undefined) return "feat";

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
