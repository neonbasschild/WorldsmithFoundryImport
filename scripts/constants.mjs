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
