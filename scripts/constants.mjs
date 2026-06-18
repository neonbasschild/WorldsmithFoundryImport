/**
 * Module-wide constants and lookup tables used to translate Worldsmith
 * vocabulary into the keys expected by the dnd5e system.
 */

export const MODULE_ID = "worldsmith-foundry-import";

/** Default icons assigned to generated documents. */
export const ICONS = {
  actor: "icons/svg/mystery-man.svg",
  attack: "icons/svg/sword.svg",
  action: "icons/svg/aura.svg",
  feature: "icons/svg/book.svg",
  legendary: "icons/svg/upgrade.svg",
  loot: "icons/svg/chest.svg"
};

/** Default icons assigned to generated standalone items, keyed by dnd5e item type. */
export const ITEM_ICONS = {
  weapon: "icons/svg/sword.svg",
  equipment: "icons/svg/shield.svg",
  consumable: "icons/svg/tankard.svg",
  tool: "icons/svg/anchor.svg",
  loot: "icons/svg/item-bag.svg"
};

/** Map Worldsmith rarity words to dnd5e `itemRarity` keys. */
export const RARITY_MAP = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  "very rare": "veryRare",
  veryrare: "veryRare",
  legendary: "legendary",
  artifact: "artifact"
};

/** Map weapon property words to dnd5e weapon property keys. */
export const WEAPON_PROPERTY_MAP = {
  ammunition: "amm",
  adamantine: "ada",
  finesse: "fin",
  firearm: "fir",
  focus: "foc",
  heavy: "hvy",
  light: "lgt",
  loading: "lod",
  magical: "mgc",
  reach: "rch",
  reload: "rel",
  returning: "ret",
  silvered: "sil",
  special: "spc",
  thrown: "thr",
  "two-handed": "two",
  "two handed": "two",
  twohanded: "two",
  versatile: "ver"
};

/** Base weapons considered "simple" (everything else is treated as martial). */
export const SIMPLE_WEAPONS = new Set([
  "club", "dagger", "greatclub", "handaxe", "javelin", "lighthammer", "light hammer",
  "mace", "quarterstaff", "sickle", "spear", "lightcrossbow", "light crossbow",
  "dart", "shortbow", "sling"
]);

/** Base weapons that are ranged (drives simpleR/martialR classification). */
export const RANGED_WEAPONS = new Set([
  "lightcrossbow", "light crossbow", "handcrossbow", "hand crossbow", "heavycrossbow",
  "heavy crossbow", "dart", "shortbow", "longbow", "sling", "blowgun", "net", "musket", "pistol"
]);

/** Map Worldsmith armor type words to dnd5e equipment type keys. */
export const ARMOR_TYPE_MAP = {
  light: "light",
  "light armor": "light",
  medium: "medium",
  "medium armor": "medium",
  heavy: "heavy",
  "heavy armor": "heavy",
  shield: "shield",
  clothing: "clothing"
};

/**
 * Map a Worldsmith item `category` to a dnd5e item type and (optionally) a
 * default subtype key for that type.
 */
export const CATEGORY_MAP = {
  weapon: { type: "weapon" },
  armor: { type: "equipment" },
  shield: { type: "equipment", subtype: "shield" },
  potion: { type: "consumable", subtype: "potion" },
  elixir: { type: "consumable", subtype: "potion" },
  oil: { type: "consumable", subtype: "potion" },
  poison: { type: "consumable", subtype: "poison" },
  food: { type: "consumable", subtype: "food" },
  scroll: { type: "consumable", subtype: "scroll" },
  ammunition: { type: "consumable", subtype: "ammo" },
  wand: { type: "consumable", subtype: "wand" },
  rod: { type: "consumable", subtype: "rod" },
  ring: { type: "equipment", subtype: "trinket" },
  staff: { type: "weapon" },
  "wondrous item": { type: "equipment", subtype: "trinket" },
  wondrous: { type: "equipment", subtype: "trinket" },
  trinket: { type: "equipment", subtype: "trinket" },
  tool: { type: "tool" },
  gear: { type: "loot" },
  "adventuring gear": { type: "loot" },
  treasure: { type: "loot" },
  material: { type: "loot" }
};

/** dnd5e die steps used when calculating versatile damage. */
export const DIE_STEPS = [4, 6, 8, 10, 12];

/** Map Worldsmith size words to dnd5e size keys. */
export const SIZE_MAP = {
  tiny: "tiny",
  small: "sm",
  sm: "sm",
  medium: "med",
  med: "med",
  large: "lg",
  lg: "lg",
  huge: "huge",
  gargantuan: "grg",
  grg: "grg"
};

/** Known dnd5e creature types. */
export const CREATURE_TYPES = new Set([
  "aberration", "beast", "celestial", "construct", "dragon", "elemental",
  "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"
]);

/** Known dnd5e damage type keys. */
export const DAMAGE_TYPES = new Set([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder"
]);

/** Known dnd5e condition keys. */
export const CONDITION_TYPES = new Set([
  "bleeding", "blinded", "charmed", "cursed", "dehydration", "deafened",
  "diseased", "exhaustion", "frightened", "grappled", "incapacitated",
  "invisible", "malnutrition", "paralyzed", "petrified", "poisoned", "prone",
  "restrained", "silenced", "stunned", "suffocation", "surprised",
  "transformed", "unconscious"
]);

/** Map ability long names to dnd5e ability keys. */
export const ABILITY_MAP = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha"
};

/** Map skill long names to dnd5e skill keys. */
export const SKILL_MAP = {
  acrobatics: "acr",
  "animal handling": "ani",
  arcana: "arc",
  athletics: "ath",
  deception: "dec",
  history: "his",
  insight: "ins",
  intimidation: "itm",
  investigation: "inv",
  medicine: "med",
  nature: "nat",
  perception: "prc",
  performance: "prf",
  persuasion: "per",
  religion: "rel",
  "sleight of hand": "slt",
  stealth: "ste",
  survival: "sur"
};

/** Map common language names to dnd5e language keys. */
export const LANGUAGE_MAP = {
  common: "common",
  "common sign language": "communication:sign",
  aarakocra: "aarakocra",
  abyssal: "abyssal",
  aquan: "aquan",
  auran: "auran",
  celestial: "celestial",
  "deep speech": "deep",
  deep: "deep",
  draconic: "draconic",
  druidic: "druidic",
  dwarvish: "dwarvish",
  elvish: "elvish",
  giant: "giant",
  gnomish: "gnomish",
  goblin: "goblin",
  "giant eagle": "giantEagle",
  gith: "gith",
  halfling: "halfling",
  ignan: "ignan",
  infernal: "infernal",
  primordial: "primordial",
  sylvan: "sylvan",
  terran: "terran",
  "thieves' cant": "cant",
  "thieves cant": "cant",
  undercommon: "undercommon"
};

/** Map coin denomination abbreviations to dnd5e currency keys. */
export const CURRENCY_MAP = {
  pp: "pp", cp: "cp", sp: "sp", ep: "ep", gp: "gp"
};
