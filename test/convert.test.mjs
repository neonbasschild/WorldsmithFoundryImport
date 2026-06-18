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

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "..", "examples");

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
