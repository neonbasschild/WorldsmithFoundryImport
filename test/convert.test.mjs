/**
 * Lightweight Node test harness (no external deps) that runs the pure
 * conversion logic against the bundled Worldsmith examples and asserts the
 * important pieces of the generated dnd5e actor data.
 *
 * Run with:  node test/convert.test.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { convertWorldsmith } from "../scripts/converter.mjs";
import { convertWorldsmithItem } from "../scripts/item-converter.mjs";
import { convertWorldsmithShop, convertWorldsmithTreasure } from "../scripts/shop-converter.mjs";
import { convertWorldsmithQuest } from "../scripts/journal-converter.mjs";
import { convertWorldsmithEncounter } from "../scripts/encounter-converter.mjs";
import { convertWorldsmithGroup } from "../scripts/group-converter.mjs";
import { convertWorldsmithRollTable } from "../scripts/table-converter.mjs";
import { convertWorldsmithSpell } from "../scripts/spell-converter.mjs";
import { convertWorldsmithFeat } from "../scripts/feat-converter.mjs";
import { detectWorldsmithType } from "../scripts/detect.mjs";
import { isStructuredWorldsmith, normalizeWorldsmithData } from "../scripts/worldsmith-parser.mjs";
import {
  FEAT_COMPENDIUM_PACKS, SPELL_COMPENDIUM_PACKS, normalizeSrdName
} from "../scripts/srd-lookup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "..", "examples");
const structuredDir = join(examplesDir, "structured");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  \u2717 ${message}`);
  }
}

function load(name) {
  return JSON.parse(readFileSync(join(examplesDir, name), "utf8"));
}

function loadStructured(name) {
  return JSON.parse(readFileSync(join(structuredDir, name), "utf8"));
}

function findItem(items, name) {
  return items.find(i => i.name === name);
}

function activitiesOf(item) {
  return Object.values(item.system.activities ?? {});
}

// --- Stormwing, the Thunder Griffin ---------------------------------------
{
  console.log("Stormwing, the Thunder Griffin");
  const { actorData, warnings } = convertWorldsmith(load("stormwing-thunder-griffin.json"));
  const s = actorData.system;

  assert(actorData.name === "Stormwing, the Thunder Griffin", "name imported");
  assert(actorData.type === "npc", "actor type is npc");
  assert(s.details.cr === 8, "CR parsed as 8");
  assert(s.traits.size === "lg", "size mapped to lg");
  assert(s.details.type.value === "custom", "unknown type stored as custom");
  assert(s.details.type.custom === "Mythical Creature", "custom type text preserved");
  assert(s.attributes.ac.flat === 16 && s.attributes.ac.calc === "natural", "natural AC 16");
  assert(s.attributes.hp.value === 85 && s.attributes.hp.max === 85, "hp 85/85");
  assert(s.attributes.hp.formula === "8d10 + 24", "hp formula composed");
  assert(s.attributes.movement.walk === 60 && s.attributes.movement.fly === 120, "movement walk/fly");
  assert(s.attributes.senses.darkvision === 60, "darkvision sense");
  assert(s.abilities.str.value === 18, "str value");
  assert(s.abilities.dex.proficient === 1, "dex save proficient");
  assert(s.abilities.str.proficient === 0, "str save not proficient");
  assert(s.traits.dv.value.includes("lightning"), "vulnerability lightning");
  assert(s.traits.dr.value.includes("thunder"), "resistance thunder");

  const beak = findItem(actorData.items, "Beak");
  assert(!!beak, "Beak action created");
  const beakAttack = activitiesOf(beak).find(a => a.type === "attack");
  assert(!!beakAttack, "Beak has attack activity");
  assert(beakAttack.attack.bonus === "7" && beakAttack.attack.flat === true, "Beak +7 flat to hit");
  assert(beakAttack.attack.type.value === "melee", "Beak melee");
  const beakDmgTypes = beakAttack.damage.parts.flatMap(p => p.types);
  assert(beakDmgTypes.includes("piercing") && beakDmgTypes.includes("lightning"), "Beak piercing + lightning damage");

  const dive = findItem(actorData.items, "Thunderous Dive");
  const diveSave = activitiesOf(dive).find(a => a.type === "save");
  assert(!!diveSave, "Thunderous Dive has a save activity");
  assert(diveSave.save.dc.formula === "15" && diveSave.save.ability[0] === "str", "Dive DC 15 Str save");

  const lightning = findItem(actorData.items, "Lightning Call");
  const lightningSave = activitiesOf(lightning).find(a => a.type === "save");
  assert(!!lightningSave, "Lightning Call has a save activity");
  assert(lightningSave.save.ability[0] === "dex", "Lightning Call Dex save");
  assert(lightningSave.damage.parts.some(p => p.types.includes("lightning")), "Lightning Call deals lightning damage");
  assert(lightning.system.uses?.recovery?.[0]?.period === "sr", "Lightning Call recharges on short rest");

  assert(!!findItem(actorData.items, "Multiattack"), "Multiattack created");
  assert(actorData.flags["worldsmith-foundry-import"].imported === true, "import flag set");
  assert(/Companion Details/.test(s.details.biography.value), "companion details in biography");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Eldritch Behemoth ----------------------------------------------------
{
  console.log("Eldritch Behemoth");
  const { actorData } = convertWorldsmith(load("eldritch-behemoth.json"));
  const s = actorData.system;

  assert(s.details.cr === 25, "CR parsed as 25");
  assert(s.traits.size === "grg", "size mapped to grg");
  assert(s.details.type.value === "aberration", "known type aberration");
  assert(s.details.alignment === "Chaotic Evil", "alignment imported");
  assert(s.attributes.ac.flat === 26, "AC 26");
  assert(s.attributes.hp.formula === "40d20 + 300", "hp formula composed");
  assert(s.attributes.senses.truesight === 120, "truesight sense");
  assert(s.traits.di.value.includes("poison") && s.traits.di.value.includes("psychic"), "immunities poison/psychic");
  assert(s.traits.ci.value.includes("charmed") && s.traits.ci.value.includes("frightened"), "condition immunities");
  assert(s.traits.languages.custom.includes("Deep Speech") || s.traits.languages.value.includes("deep"), "language captured");

  assert(s.resources.legact.max === 3, "3 legendary actions");
  const surge = findItem(actorData.items, "Telepathic Surge");
  assert(!!surge, "legendary action item created");
  const surgeActivity = activitiesOf(surge)[0];
  assert(surgeActivity.activation.type === "legendary", "legendary activation type");
  assert(surgeActivity.activation.value === 2, "Telepathic Surge costs 2");

  const aura = findItem(actorData.items, "Eldritch Aura");
  assert(!!aura, "Eldritch Aura feature created");
  assert(aura.system.properties?.includes("trait"), "feature flagged as trait");
  const auraSave = activitiesOf(aura).find(a => a.type === "save");
  assert(!!auraSave && auraSave.damage.parts.some(p => p.types.includes("psychic")), "Eldritch Aura psychic save damage");

  const tentacle = findItem(actorData.items, "Tentacle");
  const tentacleAttack = activitiesOf(tentacle).find(a => a.type === "attack");
  assert(tentacleAttack.attack.bonus === "16", "Tentacle +16 to hit");

  const hide = findItem(actorData.items, "Behemoth Hide Armor");
  assert(!!hide && hide.type === "loot", "loot item created");
  assert(hide.system.price.value === 5000 && hide.system.price.denomination === "gp", "loot price parsed");
}

// --- Whisker, the Guardian Monk (NPC creature) ----------------------------
{
  console.log("Whisker, the Guardian Monk");
  const { actorData, warnings } = convertWorldsmith(load("whisker-guardian-monk.json"));
  const s = actorData.system;

  assert(actorData.name === "Whisker", "name imported");
  assert(actorData.type === "npc", "actor type is npc");
  assert(s.details.cr === 16, "CR 16");
  assert(s.traits.size === "med", "size medium");
  assert(s.details.type.value === "custom" && s.details.type.custom === "Tabaxi", "Tabaxi -> custom type");
  assert(s.attributes.ac.flat === 21 && s.attributes.ac.calc === "flat", "Unarmored Defense -> flat AC 21");
  assert(s.attributes.hp.formula === "20d8 + 60", "hp formula composed");
  assert(s.attributes.movement.walk === 50, "walk speed 50");
  assert(s.traits.dr.value.includes("cold") && s.traits.dr.value.includes("lightning"), "resistances cold/lightning");
  assert(s.traits.languages.value.includes("celestial") && s.traits.languages.custom === "Tabaxi",
    "languages mapped with Tabaxi as custom");
  assert(s.abilities.dex.proficient === 1 && s.abilities.con.proficient === 0, "save proficiencies");
  assert(s.resources.legact.max === 3, "3 legendary actions");

  const find = n => actorData.items.find(i => i.name === n);
  const staff = find("Quarterstaff (Masterwork)");
  const staffAttack = Object.values(staff.system.activities).find(a => a.type === "attack");
  assert(staffAttack?.attack.bonus === "13", "quarterstaff +13 to hit");
  const flood = find("Mystic Flood");
  const floodSave = Object.values(flood.system.activities).find(a => a.type === "save");
  assert(floodSave?.save.ability[0] === "str" && floodSave.save.dc.formula === "19", "Mystic Flood DC 19 Str save");
  assert(!!find("Ki Reservoir") && !!find("River Pearl"), "feature and loot items created");
  assert(/Quest: Corruption in the Whispering River/.test(s.details.biography.value), "quest in biography");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Type detection -------------------------------------------------------
{
  console.log("Type detection");
  assert(detectWorldsmithType(load("stormwing-thunder-griffin.json")) === "creature", "griffin detected as creature");
  assert(detectWorldsmithType(load("eldritch-behemoth.json")) === "creature", "behemoth detected as creature");
  assert(detectWorldsmithType(load("whisker-guardian-monk.json")) === "creature", "whisker detected as creature");
  assert(detectWorldsmithType(load("blade-of-eternal-shadows.json")) === "item", "blade detected as item");
  assert(detectWorldsmithType(load("durins-forge-shop.json")) === "shop", "forge detected as shop");
  assert(detectWorldsmithType(load("crypt-of-the-shadow-drake-treasure.json")) === "treasure", "crypt detected as treasure");
  assert(detectWorldsmithType(load("heist-of-the-sunfire-amulet-quest.json")) === "quest", "heist detected as quest");
  assert(detectWorldsmithType(load("ethereal-chains-spell.json")) === "spell", "ethereal chains detected as spell");
  assert(detectWorldsmithType(load("echo-of-the-ancients-feat.json")) === "feat", "echo detected as feat");
}

// --- Blade of Eternal Shadows (item) --------------------------------------
{
  console.log("Blade of Eternal Shadows");
  const { itemData, warnings } = convertWorldsmithItem(load("blade-of-eternal-shadows.json"));
  const s = itemData.system;

  assert(itemData.name === "Blade of Eternal Shadows", "item name imported");
  assert(itemData.type === "weapon", "item type is weapon");
  assert(s.rarity === "legendary", "rarity mapped to legendary");
  assert(s.price.value === 75000 && s.price.denomination === "gp", "price 75000 gp");
  assert(s.weight.value === 3, "weight 3");
  assert(s.attunement === "required", "attunement required");

  assert(s.type.value === "martialM", "longsword classified as martial melee");
  assert(s.type.baseItem === "longsword", "base item longsword");

  assert(s.damage.base.number === 1 && s.damage.base.denomination === 8, "base damage 1d8");
  assert(s.damage.base.types.includes("slashing"), "base damage slashing");
  assert(!!s.damage.versatile && s.damage.versatile.denomination === 10, "versatile steps up to d10");

  assert(s.properties.includes("ver") && s.properties.includes("fin") && s.properties.includes("mgc"),
    "properties versatile/finesse/magical mapped");
  assert(s.range.reach === 5, "melee reach 5 ft");

  assert(s.magicalBonus === 2, "+2 magical bonus parsed from usage");
  assert(s.uses?.max === "3", "3 charges parsed");
  assert(s.uses?.recovery?.[0]?.period === "dawn", "charges recharge at dawn");

  assert(/Eternal Shadows command/.test(s.description.value), "flavor description present");
  assert(/Properties/.test(s.description.value) && /veil of darkness/.test(s.description.value),
    "usage text preserved in description");
  assert(/Lore/.test(s.description.value), "lore section present");
  assert(itemData.flags["worldsmith-foundry-import"].kind === "item", "item flag set");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Durin's Forge (shop -> Item Piles merchant) --------------------------
{
  console.log("Durin's Forge (shop)");
  const { merchant, owners, warnings } = convertWorldsmithShop(load("durins-forge-shop.json"));

  assert(merchant.name === "Durin's Forge", "merchant name imported");
  assert(merchant.type === "npc", "merchant is an npc");

  const pile = merchant.flags["item-piles"];
  assert(pile?.data?.enabled === true && pile?.data?.type === "merchant", "actor item-piles merchant flag set");
  const tokenPile = merchant.prototypeToken.flags["item-piles"];
  assert(tokenPile?.data?.type === "merchant", "prototype token item-piles flag set");

  // 9 standard items + 3 magic items + 6 services = 18 embedded items.
  assert(merchant.items.length === 18, `expected 18 embedded items, got ${merchant.items.length}`);
  assert(merchant.items.every(i => i.flags["item-piles"] && "item" in i.flags["item-piles"]),
    "every embedded item carries an item-piles item flag");

  const find = n => merchant.items.find(i => i.name === n);

  const chainMail = find("Chain Mail");
  assert(chainMail.type === "equipment" && chainMail.system.type.value === "heavy", "Chain Mail -> heavy armor");
  assert(chainMail.system.armor.value === 16, "Chain Mail AC 16");
  assert(chainMail.system.price.value === 75, "Chain Mail price 75 gp");

  const shield = find("Shield");
  assert(shield.type === "equipment" && shield.system.type.value === "shield", "Shield -> shield equipment");
  assert(shield.system.armor.value === 2, "Shield AC bonus 2");

  const battleaxe = find("Battleaxe");
  assert(battleaxe.type === "weapon", "Battleaxe -> weapon");
  assert(battleaxe.system.damage.base.denomination === 8, "Battleaxe base d8");
  assert(battleaxe.system.damage.versatile?.denomination === 10, "Battleaxe versatile d10");
  assert(battleaxe.system.properties.includes("ver"), "Battleaxe versatile property");

  const longsword = find("Steel Longsword");
  assert(longsword.type === "weapon" && longsword.system.type.baseItem === "longsword", "Steel Longsword -> longsword weapon");

  const greatsword = find("Greatsword");
  assert(greatsword.type === "weapon" && greatsword.system.damage.base.number === 2
    && greatsword.system.damage.base.denomination === 6, "Greatsword 2d6");

  // Magic items routed through the item converter.
  const mithril = find("Mithril Sword");
  assert(mithril.type === "weapon" && mithril.system.rarity === "uncommon", "Mithril Sword magic weapon");
  assert(mithril.system.magicalBonus === 2, "Mithril Sword +2 bonus");
  const enchantedShield = find("Enchanted Shield");
  assert(enchantedShield.type === "equipment" && enchantedShield.system.type.value === "shield", "Enchanted Shield -> shield");

  // Services.
  const sharpening = find("Weapon Sharpening");
  assert(!!sharpening, "service item created");
  assert(sharpening.flags["item-piles"].item.isService === true, "service flagged isService");
  assert(sharpening.system.price.value === 5, "service price parsed");
  assert(/Price:/.test(sharpening.system.description.value), "service price text in description");

  // Owner becomes a full NPC actor.
  assert(owners.length === 1, "one owner actor created");
  const borin = owners[0];
  assert(borin.name === "Borin Ironhand", "owner name imported");
  assert(borin.type === "npc", "owner is npc");
  assert(borin.system.details.cr === 6, "owner CR 6");
  assert(/Quest: Embers of an Old Technique/.test(borin.system.details.biography.value), "owner quest in biography");
  assert(/Additional Details/.test(borin.system.details.biography.value), "owner additional details in biography");

  console.log(`  warnings: ${warnings.length}`);
}

// --- The Crypt of the Shadow Drake (treasure -> Item Piles loot pile) -----
{
  console.log("The Crypt of the Shadow Drake (treasure)");
  const { pile, warnings } = convertWorldsmithTreasure(load("crypt-of-the-shadow-drake-treasure.json"));

  assert(pile.name === "The Crypt of the Shadow Drake", "pile name imported");
  assert(pile.type === "npc", "pile is an npc");

  const flag = pile.flags["item-piles"];
  assert(flag?.data?.enabled === true && flag?.data?.type === "pile", "actor item-piles pile flag set");
  const tokenFlag = pile.prototypeToken.flags["item-piles"];
  assert(tokenFlag?.data?.type === "pile", "token item-piles pile flag set");
  assert(tokenFlag !== flag, "actor and token flags are separate objects");

  assert(pile.system.currency.cp === 125 && pile.system.currency.sp === 200
    && pile.system.currency.gp === 90 && pile.system.currency.pp === 15, "currency imported");

  // 4 basic items + 2 notable items = 6 embedded items.
  assert(pile.items.length === 6, `expected 6 embedded items, got ${pile.items.length}`);
  assert(pile.items.every(i => i.flags["item-piles"] && "item" in i.flags["item-piles"]),
    "every embedded item carries an item-piles item flag");

  const find = n => pile.items.find(i => i.name === n);

  const rubies = find("Ruby Gemstones");
  assert(rubies.system.quantity === 3, "Ruby Gemstones quantity 3");
  assert(rubies.system.price.value === 300, "Ruby Gemstones price 300 gp");

  const statuette = find("Celestial Stag Statuette");
  assert(statuette.type === "loot", "Statuette -> loot");
  assert(statuette.system.price.value === 250, "Statuette price 250 gp");

  // Notable items routed through the item converter.
  const blade = find("Blade of Eternal Shadows");
  assert(blade.type === "weapon" && blade.system.rarity === "legendary", "Blade notable weapon");
  assert(blade.system.quantity === 1, "Blade quantity from wrapper");
  const shield = find("Shield of Radiance");
  assert(shield.type === "equipment" && shield.system.type.value === "shield", "Shield of Radiance -> shield");
  assert(shield.system.rarity === "rare", "Shield of Radiance rare");

  assert(pile.flags["worldsmith-foundry-import"].kind === "treasure", "treasure flag set");
  assert(/Ancient Dragon Hoard|glitters with ancient wealth/.test(pile.system.details.biography.value),
    "treasure description in biography");
  console.log(`  warnings: ${warnings.length}`);
}

// --- The Heist of the Sunfire Amulet (quest -> journal entry) -------------
{
  console.log("The Heist of the Sunfire Amulet (quest)");
  const { journalData, warnings } = convertWorldsmithQuest(load("heist-of-the-sunfire-amulet-quest.json"));

  assert(journalData.name === "The Heist of the Sunfire Amulet", "journal name imported");
  assert(Array.isArray(journalData.pages) && journalData.pages.length === 5, `expected 5 pages, got ${journalData.pages.length}`);
  assert(journalData.pages.every(p => p.type === "text" && p.text.format === 1), "all pages are HTML text pages");
  assert(journalData.pages.every((p, i) => p.sort === (i + 1) * 100), "pages sorted in order");

  const page = n => journalData.pages.find(p => p.name === n);

  const overview = page("Overview");
  assert(!!overview && /Heist Quest/.test(overview.text.content), "overview has subtitle");
  assert(/merchant prince, Talmon/.test(overview.text.content), "overview has gm overview text");

  assert(/Raven sends his regards/.test(page("Adventure Hook").text.content), "hook page content");

  const objectives = page("Objectives");
  assert(/<ol>/.test(objectives.text.content), "objectives rendered as ordered list");
  assert(/Gather information on the vault/.test(objectives.text.content), "objective task present");
  assert(/<blockquote>/.test(objectives.text.content), "objective quote rendered as blockquote");

  const rewards = page("Rewards");
  assert(/5,000 gold pieces each/.test(rewards.text.content), "reward item present");
  assert(/\(5000 gp\)/.test(rewards.text.content), "meaningful reward price shown");
  assert(!/\(n\/a\)/i.test(rewards.text.content), "n/a reward price omitted");

  assert(/outcome depends entirely/.test(page("Resolution").text.content), "resolution page content");
  assert(journalData.flags["worldsmith-foundry-import"].kind === "quest", "quest flag set");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Ethereal Chains (spell -> dnd5e spell item) --------------------------
{
  console.log("Ethereal Chains (spell)");
  const { itemData, warnings } = convertWorldsmithSpell(load("ethereal-chains-spell.json"));
  const s = itemData.system;

  assert(itemData.name === "Ethereal Chains", "spell name imported");
  assert(itemData.type === "spell", "item type is spell");
  assert(s.level === 3, "spell level 3");
  assert(s.school === "evo", "school evocation -> evo");
  assert(s.properties.includes("vocal") && s.properties.includes("somatic"), "V/S components");
  assert(s.properties.includes("concentration"), "concentration property");
  assert(!s.properties.includes("material"), "no material component");
  assert(!s.properties.includes("ritual"), "not ritual");
  assert(s.activation.type === "bonus", "bonus action casting time");
  assert(s.duration.value === "1" && s.duration.units === "minute", "1 minute duration");
  assert(s.range.value === "30" && s.range.units === "ft", "range 30 ft parsed from description");
  assert(s.method === "spell", "preparation method spell");

  const activity = Object.values(s.activities)[0];
  assert(activity.type === "save", "spell has a save activity");
  assert(activity.save.ability[0] === "str", "Strength save");
  assert(activity.save.dc.calculation === "spellcasting", "DC uses spellcasting");

  assert(/Classes:<\/strong> Wizard, Warlock/.test(s.description.value), "classes appended to description");
  assert(/Species:<\/strong> Elf, Gnome/.test(s.description.value), "species appended to description");
  assert(/Lore/.test(s.description.value), "lore section present");
  assert(itemData.flags["worldsmith-foundry-import"].kind === "spell", "spell flag set");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Damage spell activity (parsed from description) ----------------------
{
  console.log("Damage spell parsing");
  const { itemData } = convertWorldsmithSpell({
    name: "Flame Bolt", level: 1, school: "Evocation", verbal: true,
    castingTime: "Action", duration: "Instantaneous",
    description: "Make a ranged spell attack against a target within 60 feet. On a hit it takes 3d6 fire damage."
  });
  const act = Object.values(itemData.system.activities)[0];
  assert(act.type === "attack", "ranged spell attack -> attack activity");
  assert(act.attack.type.classification === "spell", "spell attack classification");
  assert(act.damage.parts.some(p => p.types.includes("fire") && p.denomination === 6), "3d6 fire damage parsed");
}

// --- Echo of the Ancients (feat -> dnd5e feat item) -----------------------
{
  console.log("Echo of the Ancients (feat)");
  const { itemData, warnings } = convertWorldsmithFeat(load("echo-of-the-ancients-feat.json"));
  const s = itemData.system;

  assert(itemData.name === "Echo of the Ancients", "feat name imported");
  assert(itemData.type === "feat", "item type is feat");
  assert(s.type.value === "feat", "system feature type is feat");
  assert(s.prerequisites.level === 5, "level 5 prerequisite extracted");
  assert(s.prerequisites.repeatable === false, "not repeatable");
  assert(/Elf or Dwarf/.test(s.requirements) && /level 5/.test(s.requirements), "requirements text composed");
  assert(s.uses && s.uses.max === "1" && s.uses.recovery[0].period === "day", "once per day -> 1 use/day");

  const activity = Object.values(s.activities)[0];
  assert(activity.type === "utility", "utility activity created for limited-use feat");
  assert(activity.consumption.targets[0].type === "itemUses", "utility activity consumes item uses");

  assert(/Exploration - Ancestral/.test(s.description.value), "subtitle in description");
  assert(/Prerequisites:/.test(s.description.value), "prerequisites in description");
  assert(/advantage on History/.test(s.description.value), "mechanics in description");
  assert(itemData.flags["worldsmith-foundry-import"].kind === "feat", "feat flag set");
  console.log(`  warnings: ${warnings.length}`);
}

// --- Passive feat with no uses (no activity) ------------------------------
{
  console.log("Passive feat parsing");
  const { itemData } = convertWorldsmithFeat({
    name: "Tough", mechanics: "Your hit point maximum increases by an amount equal to twice your level."
  });
  assert(Object.keys(itemData.system.activities ?? {}).length === 0, "purely passive feat has no activity");
  assert(itemData.system.uses === undefined, "passive feat has no uses");
}

// --- Embedded quest wrapper (creature/owner shape) ------------------------
{
  console.log("Embedded quest wrapper");
  const wrapped = { data: { name: "Side Quest", gm_overview: "Do the thing.", objectives: [{ task: "Thing" }] } };
  const { journalData } = convertWorldsmithQuest(wrapped);
  assert(journalData.name === "Side Quest", "unwraps { data } quest shape");
  assert(journalData.pages.length >= 1, "wrapped quest produces pages");
}

// --- Structured Worldsmith format (rootId + items map) --------------------
{
  console.log("Structured format detection");
  const raw = loadStructured("Crane-Style_Footwork_3e62.json");
  assert(isStructuredWorldsmith(raw), "feat export detected as structured");
  const normalized = normalizeWorldsmithData(raw);
  assert(normalized.name === "Crane-Style Footwork", "feat name normalised");
  assert(Array.isArray(normalized.prerequisites), "feat prerequisites array");
  assert(detectWorldsmithType(normalized) === "feat", "normalised feat type");
}

{
  console.log("Structured familiar (Miru)");
  const raw = loadStructured("Miru__the_Whimsy_Tail_db68.json");
  const { actorData, warnings } = convertWorldsmith(normalizeWorldsmithData(raw));
  assert(actorData.name === "Miru, the Whimsy Tail", "familiar name");
  assert(actorData.system.abilities.dex.value === 18, "Miru DEX parsed from StatLine");
  assert(actorData.system.attributes.hp.max === 7, "Miru HP parsed");
  assert(findItem(actorData.items, "Bite"), "Miru bite action imported");
  console.log(`  warnings: ${warnings.length}`);
}

{
  console.log("Structured spell (Void Shackle)");
  const raw = loadStructured("Void_Shackle_83c1.json");
  const { itemData } = convertWorldsmithSpell(normalizeWorldsmithData(raw));
  assert(itemData.name === "Void Shackle", "spell name");
  assert(itemData.system.level === 4, "spell level from StatLine");
  assert(itemData.system.school === "enc", "spell school");
  assert(itemData.system.properties.includes("concentration"), "concentration flag");
}

{
  console.log("Structured magic item (Scroll of the First Dawn)");
  const raw = loadStructured("Scroll_of_the_First_Dawn_2823.json");
  const { itemData } = convertWorldsmithItem(normalizeWorldsmithData(raw));
  assert(itemData.name === "Scroll of the First Dawn", "item name");
  assert(itemData.system.rarity === "artifact", "item rarity");
}

{
  console.log("Structured quest (Whispers of the Kitsune)");
  const raw = loadStructured("Whispers_of_the_Kitsune_acff.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(Array.isArray(normalized.actors), "quest has actors array");
  assert(normalized.actors.length === 2, "quest extracts ally and enemy actors");
  assert(normalized.actors.some(a => a.identity?.name === "Shinobu, Shrine Courier"), "quest ally actor extracted");
  assert(normalized.actors.some(a => a.identity?.name === "Lion Clan Constable"), "quest enemy actor extracted");
  assert(normalized.items.some(i => i.name === "Shrine Token"), "quest inline loot item extracted");
  for (const actorSource of normalized.actors) {
    const { actorData } = convertWorldsmith(actorSource);
    assert(actorData.system.attributes.hp.max > 0, `actor ${actorData.name} has HP`);
  }
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.name === "Whispers of the Kitsune", "quest name");
  assert(journalData.pages.some(p => p.name === "Objectives"), "quest objectives page");
  assert(journalData.pages.some(p => p.name === "Rewards"), "quest rewards page");
}

{
  console.log("Structured treasure (Whispers of the Crane Shrine)");
  const raw = loadStructured("Whispers_of_the_Crane_Shrine_3d2d.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "treasure", "treasure type detected");
  assert(normalized.documentKind === "treasure", "treasure document kind");
  const { pile } = convertWorldsmithTreasure(normalized);
  assert(pile.name === "Whispers of the Crane Shrine", "treasure pile name");
  assert((pile.items?.length ?? 0) > 0, "treasure pile has items");
  assert(pile.flags["item-piles"]?.data?.type === "pile", "treasure item piles pile flag");
}

{
  console.log("Structured treasure (Ember Vault of the Five Rings)");
  const raw = loadStructured("Ember_Vault_of_the_Five_Rings_Treasure_456a.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "treasure", "ember vault treasure type");
  assert(normalized.documentKind === "treasure", "ember vault document kind");
  assert(normalized.name === "Ember Vault of the Five Rings", "ember vault name");
  assert(normalized.subtitle.includes("Legendary Booty"), "ember vault subtitle");
  assert(normalized.description.includes("Siege of Kharis"), "ember vault description");
  assert(normalized.currency.cp === 120, "ember vault copper");
  assert(normalized.currency.gp === 5220, "ember vault gold");
  assert(normalized.currency.pp === 150, "ember vault platinum");
  assert(normalized.basic_items.length === 7, "ember vault basic items");
  assert(normalized.basic_items.some(i => i.item === "Polished Jade Seal"), "ember vault basic item name");
  assert(normalized.basic_items.every(i => i.item !== "Item"), "ember vault skips table header row");
  assert(normalized.notable_items.length === 3, "ember vault notable items");
  assert(normalized.notable_items.some(i => i.name === "Breath of Mount Ryoshima"), "ember vault naginata");
  assert(normalized.notable_items.some(i => i.name === "Crane-Dancer's War Fan"), "ember vault war fan");
  assert(normalized.notable_items.some(i => i.name === "Mask of the Oni's Bellow"), "ember vault mask");
  assert(normalized.notable_items.find(i => i.name === "Breath of Mount Ryoshima")?.rarity === "Rare", "ember vault naginata rarity");
  const { pile, warnings } = convertWorldsmithTreasure(normalized);
  assert(pile.name === "Ember Vault of the Five Rings", "ember vault pile name");
  assert(pile.items.length === 10, "ember vault pile item count");
  assert(pile.system.currency.gp === 5220, "ember vault pile currency");
  assert(pile.flags["worldsmith-foundry-import"].kind === "treasure", "ember vault import flag");
  assert(pile.flags["item-piles"]?.data?.enabled === true, "ember vault item piles enabled");
  assert(pile.items.some(i => i.name === "Breath of Mount Ryoshima"), "ember vault pile notable item");
  assert(warnings.length === 0, "ember vault no conversion warnings");
}

{
  console.log("Structured NPC (Prince Seppun Genji)");
  const raw = loadStructured("Prince_Seppun_Genji_8e85.json");
  const { actorData } = convertWorldsmith(normalizeWorldsmithData(raw));
  assert(actorData.name === "Prince Seppun Genji", "npc name");
  assert(actorData.system.abilities.dex.value === 16, "npc DEX parsed");
  assert(findItem(actorData.items, "Rapier"), "npc rapier action imported");
}

{
  console.log("Structured session (Shadows over Tsuma)");
  const raw = loadStructured("Shadows_over_Tsuma-session_f275.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "session", "session type detected");
  assert(normalized.documentKind === "session", "session document kind");
  assert(normalized.actors.length === 4, "session extracts four creature actors");
  assert(normalized.actors.some(a => a.identity?.name === "Shizuko Nariko"), "session NPC extracted");
  assert(normalized.actors.some(a => a.identity?.name === "Masked Oni Sorcerer"), "session monster extracted");
  assert(normalized.items.length === 3, "session extracts three loot items");
  assert(normalized.items.some(i => i.name === "Jade Amulet of Insight"), "session loot item extracted");
  assert(normalized.sections.length >= 5, "session encounter pages collected");
  assert(normalized.objectives.some(o => o.quote), "session objective quotes parsed");
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.flags["worldsmith-foundry-import"].kind === "session", "session journal kind");
  assert(journalData.pages.some(p => p.name === "Key Details"), "session key details page");
  assert(journalData.pages.some(p => p.name === "Scene 1: The Magistrate's Call"), "session scene page");
}

{
  console.log("Structured deity (Kurozani, the Twelfth Decay)");
  const raw = loadStructured("Kurozani__the_Twelfth_Decay_650b.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "deity", "deity type detected");
  assert(normalized.documentKind === "deity", "deity document kind");
  assert(normalized.name === "Kurozani, the Twelfth Decay", "deity name");
  assert(normalized.gm_overview.includes("hulking silhouette"), "deity description parsed");
  assert(normalized.sections.some(s => s.name === "Lore"), "deity lore section");
  assert(normalized.sections.some(s => s.name === "Followers"), "deity followers section");
  assert(normalized.sections.some(s => s.name === "Worship"), "deity worship section");
  assert(normalized.sections.some(s => s.name === "Follower Benefits"), "deity follower benefits section");
  assert(normalized.spells.length === 3, "deity extracts three spells");
  assert(normalized.spells.some(s => s.name === "Rotting Touch"), "deity spell name stripped");
  assert(normalized.feats.length === 2, "deity extracts two feats");
  assert(normalized.feats.some(f => f.name === "Blessing of Kurozani"), "deity feat name stripped");
  assert(normalized.items.length === 2, "deity extracts two magic items");
  assert(normalized.items.some(i => i.name === "Staff of Fungal Decay"), "deity item name stripped");
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.flags["worldsmith-foundry-import"].kind === "deity", "deity journal kind");
  assert(journalData.pages.some(p => p.name === "Overview"), "deity overview page");
  assert(journalData.pages.some(p => p.name === "Worship"), "deity worship page");
  for (const spellSource of normalized.spells) {
    const { itemData } = convertWorldsmithSpell(spellSource);
    assert(itemData.name === spellSource.name, `spell ${itemData.name} converts`);
  }
  for (const featSource of normalized.feats) {
    const { itemData } = convertWorldsmithFeat(featSource);
    assert(itemData.name === featSource.name, `feat ${itemData.name} converts`);
  }
}

{
  console.log("Structured encounter (Ambush of the Silvan Kodama)");
  const raw = loadStructured("Ambush_of_the_Silvan_Kodama_6b79.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "encounter", "encounter type detected");
  assert(normalized.documentKind === "encounter", "encounter document kind");
  assert(normalized.name === "Ambush of the Silvan Kodama", "encounter name");
  assert(normalized.set_the_scene.includes("narrow forest path"), "encounter set the scene parsed");
  assert(normalized.objective.includes("Survive the Kodama"), "encounter objective parsed");
  assert(normalized.key_features.includes("Ancient Torii Ruins"), "encounter key features parsed");
  assert(normalized.members.length === 1, "encounter extracts one member type");
  assert(normalized.members[0].identity?.name === "Silvan Kodama", "encounter member name");
  assert(normalized.members[0].quantity === 1, "encounter member quantity defaults to 1");
  const { encounterData, memberSources } = convertWorldsmithEncounter(normalized);
  assert(encounterData.type === "encounter", "encounter actor type");
  assert(encounterData.system.description.full.includes("Set the Scene"), "encounter description includes scene");
  assert(encounterData.prototypeToken.actorLink === true, "encounter token is linked");
  assert(memberSources.length === 1, "encounter converter passes member sources");
  const { actorData } = convertWorldsmith(memberSources[0]);
  assert(actorData.type === "npc", "encounter member converts to npc");
  assert(actorData.name === "Silvan Kodama", "encounter member npc name");
}

{
  console.log("Structured dungeon (Kozanji no Miko)");
  const raw = loadStructured("Kozanji_no_Miko_9e04.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "dungeon", "dungeon type detected");
  assert(normalized.documentKind === "dungeon", "dungeon document kind");
  assert(normalized.name === "Kozanji no Miko", "dungeon name");
  assert(normalized.lore.includes("ancient mountain shrine"), "dungeon lore parsed");
  assert(normalized.layout.includes("five chambers"), "dungeon layout parsed");
  assert(normalized.objectives.length === 5, "dungeon objectives parsed");
  assert(normalized.rooms.length === 5, "dungeon extracts five rooms");
  assert(normalized.rooms.some(r => r.name === "Overgrown Gatehouse"), "dungeon room name");
  assert(normalized.rooms.some(r => r.content.includes("moss-slick torii")), "dungeon room content");
  assert(normalized.encounters.length === 5, "dungeon extracts five encounters");
  assert(normalized.encounters.every(e => e.documentKind === "encounter"), "dungeon encounter kind");
  assert(normalized.encounters.some(e => e.members.length > 0), "dungeon encounter has members");
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.flags["worldsmith-foundry-import"].kind === "dungeon", "dungeon journal kind");
  assert(journalData.pages.some(p => p.name === "Lore"), "dungeon lore page");
  assert(journalData.pages.some(p => p.name === "Layout"), "dungeon layout page");
  assert(journalData.pages.some(p => p.name === "Overgrown Gatehouse"), "dungeon room page");
  const { encounterData } = convertWorldsmithEncounter(normalized.encounters[0]);
  assert(encounterData.type === "encounter", "nested encounter converts to group actor");
}

{
  console.log("Structured group (Order of the Umbral Lotus)");
  const raw = loadStructured("Order_of_the_Umbral_Lotus_da1e.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "group", "group type detected");
  assert(normalized.documentKind === "group", "group document kind");
  assert(normalized.name === "Order of the Umbral Lotus", "group name");
  assert(normalized.overview.includes("clandestine brotherhood"), "group overview parsed");
  assert(normalized.basic_information.includes("Secret Society"), "group basic information parsed");
  assert(normalized.goals.includes("Preserve and expand"), "group goals parsed");
  assert(normalized.organization_structure.includes("High Matron"), "group organization structure parsed");
  assert(normalized.members.length === 1, "group extracts one embedded NPC");
  assert(normalized.members[0].identity?.name === "Matron Akura, the Jade Veil", "group member name");
  const { groupData, memberSources } = convertWorldsmithGroup(normalized);
  assert(groupData.type === "group", "group actor type");
  assert(groupData.system.description.full.includes("Overview"), "group description includes overview");
  assert(groupData.prototypeToken.actorLink === true, "group token is linked");
  assert(memberSources.length === 1, "group converter passes member sources");
  const { actorData } = convertWorldsmith(memberSources[0]);
  assert(actorData.type === "npc", "group member converts to npc");
}

{
  console.log("Structured puzzle (Shrine of the Celestial Kami's Fivefold Test)");
  const raw = loadStructured("Shrine_of_the_Celestial_Kami_s_Fivefold_Test_puzzle_d7de.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "puzzle", "puzzle type detected");
  assert(normalized.documentKind === "puzzle", "puzzle document kind");
  assert(normalized.name === "Shrine of the Celestial Kami’s Fivefold Test", "puzzle name");
  assert(normalized.subtitle.includes("Aligning the Essence of the Kami"), "puzzle subtitle parsed");
  assert(normalized.hook.includes("vaulted circular chamber"), "puzzle intro text parsed");
  assert(normalized.gm_overview.includes("Five Celestial Kami"), "puzzle description parsed");
  assert(normalized.sections.some(s => s.name === "Hints"), "puzzle hints section");
  assert(normalized.sections.some(s => s.name === "Solution"), "puzzle solution section");
  assert(normalized.sections.some(s => s.name === "Failure Consequence"), "puzzle failure section");
  assert(normalized.sections.find(s => s.name === "Hints")?.content.includes("DC 16 Intelligence"), "puzzle hints content");
  assert(normalized.sections.find(s => s.name === "Solution")?.content.includes("Earth (brown)"), "puzzle solution content");
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.flags["worldsmith-foundry-import"].kind === "puzzle", "puzzle journal kind");
  assert(journalData.pages.some(p => p.name === "Overview"), "puzzle overview page");
  assert(journalData.pages.some(p => p.name === "Intro Text"), "puzzle intro text page");
  assert(journalData.pages.some(p => p.name === "Hints"), "puzzle hints page");
  assert(journalData.pages.some(p => p.name === "Solution"), "puzzle solution page");
  assert(journalData.pages.some(p => p.name === "Failure Consequence"), "puzzle failure page");
}

{
  console.log("Structured trap (Senkei Kageblade Petal Trap)");
  const raw = loadStructured("Senkei_Kageblade_Petal_Trap_9195.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "trap", "trap type detected");
  assert(normalized.documentKind === "trap", "trap document kind");
  assert(normalized.name === "Senkei Kageblade Petal Trap", "trap name");
  assert(normalized.subtitle.includes("Mechanical"), "trap subtitle parsed");
  assert(normalized.gm_overview.includes("pressure plate"), "trap details parsed");
  assert(normalized.hook.includes("dimly lit corridor"), "trap description parsed");
  assert(normalized.sections.some(s => s.name === "Skill Checks"), "trap skill checks section");
  assert(normalized.sections.some(s => s.name === "Consequence"), "trap consequence section");
  assert(normalized.sections.find(s => s.name === "Skill Checks")?.content.includes("DC 13 Wisdom"), "trap skill checks content");
  assert(normalized.sections.find(s => s.name === "Consequence")?.content.includes("6d6 slashing"), "trap consequence content");
  const { journalData } = convertWorldsmithQuest(normalized);
  assert(journalData.flags["worldsmith-foundry-import"].kind === "trap", "trap journal kind");
  assert(journalData.pages.some(p => p.name === "Overview"), "trap overview page");
  assert(journalData.pages.some(p => p.name === "Description"), "trap description page");
  assert(journalData.pages.some(p => p.name === "Skill Checks"), "trap skill checks page");
  assert(journalData.pages.some(p => p.name === "Consequence"), "trap consequence page");
}

{
  console.log("Structured roll table (Rumors of Otosan Uchi)");
  const raw = loadStructured("Rumors_of_Otosan_Uchi-table_f941.json");
  const normalized = normalizeWorldsmithData(raw);
  assert(detectWorldsmithType(normalized) === "rollTable", "roll table type detected");
  assert(normalized.documentKind === "rollTable", "roll table document kind");
  assert(normalized.name === "Rumors of Otosan Uchi", "roll table name");
  assert(normalized.subtitle.includes("d100"), "roll table subtitle parsed");
  assert(normalized.formula === "1d100", "roll table formula parsed");
  assert(normalized.description.includes("Imperial City of Otosan Uchi"), "roll table description parsed");
  assert(normalized.results.length === 20, "roll table extracts twenty results");
  assert(normalized.results[0].range[0] === 1 && normalized.results[0].range[1] === 5, "first result range");
  assert(normalized.results[0].text.includes("netsuke carving"), "first result text");
  assert(normalized.results.at(-1).range[0] === 96 && normalized.results.at(-1).range[1] === 100, "last result range");
  assert(normalized.results.at(-1).text.includes("cursed mirror"), "last result text");
  const { tableData } = convertWorldsmithRollTable(normalized);
  assert(tableData.name === "Rumors of Otosan Uchi", "roll table converter name");
  assert(tableData.formula === "1d100", "roll table converter formula");
  assert(tableData.replacement === true, "roll table replacement enabled");
  assert(tableData.displayRoll === true, "roll table display roll enabled");
  assert(tableData.results.length === 20, "roll table converter result count");
  assert(tableData.results[0].type === "text", "roll table result type");
  assert(tableData.results[0].range[0] === 1 && tableData.results[0].range[1] === 5, "roll table result range");
  assert(tableData.results[0].text.includes("netsuke carving"), "roll table result text");
  assert(tableData.flags["worldsmith-foundry-import"].kind === "rollTable", "roll table import flag kind");
}

{
  console.log("SRD name normalization");
  assert(normalizeSrdName("Spell: Fireball") === "fireball", "strip spell prefix");
  assert(normalizeSrdName("  False Life  ") === "false life", "trim and lowercase");
  assert(normalizeSrdName("Feat: Alert") === "alert", "strip feat prefix");
  assert(SPELL_COMPENDIUM_PACKS.includes("dnd5e.spells24"), "modern spell pack listed");
  assert(FEAT_COMPENDIUM_PACKS.includes("dnd5e.feats24"), "modern feat pack listed");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
