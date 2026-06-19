# Worldsmith Foundry Import

A [Foundry VTT](https://foundryvtt.com/) module that converts and imports
[Worldsmith](https://www.worldsmith.io/) JSON exports into the **dnd5e** system:

- **Creatures / companions** → fully-statted NPC actors.
- **Items** (weapons, armor, potions, wondrous items, etc.) → dnd5e items.
- **Spells** → dnd5e spell items.
- **Feats** → dnd5e feat items.
- **Shops** → [Item Piles](https://fantasycomputer.works/FoundryVTT-ItemPiles/)
  merchant actors, with their owners imported as separate NPCs.
- **Treasure / loot** → Item Piles loot pile actors (with currency).
- **Quests** → journal entries (one page per quest section).
- **Encounters** → dnd5e encounter group actors with member NPCs.
- **Groups** → dnd5e faction/party group actors with member NPCs.
- **Dungeons** → journal entries with room pages, plus encounter groups per room.
- **Puzzles** → journal entries (overview, intro text, hints, solution, and failure consequence pages).
- **Traps** → journal entries (overview, description, skill checks, and consequence pages).
- **Roll tables** → Foundry rollable tables with ranged text results.

The type of each export is detected automatically.

- **Foundry VTT:** v13+ (verified on v14)
- **Game System:** dnd5e v5+

## Features

- Adds an **Import Worldsmith** button to the *Actors* sidebar (GM only).
- Upload one or more `.json` files at once, or paste JSON directly.
- Accepts a single object or an array, and can mix creatures and items.
- Automatically detects whether each entry is a creature or an item.

### Creatures

Converts the full Worldsmith stat block into a dnd5e NPC:
  - Identity → name, creature type/subtype, size, alignment, biography.
  - Attributes → AC (incl. natural armor), HP + hit-dice formula, movement
    (walk/fly/swim/climb/burrow), senses (darkvision/blindsight/tremorsense/truesight).
  - Abilities → scores and saving-throw proficiencies (with a corrective save
    bonus when the export's listed save total differs from the calculated one).
  - Damage vulnerabilities / resistances / immunities and condition immunities.
  - Languages and skill proficiencies.
  - Challenge rating (including fractional CRs such as `1/2`).
  - Legendary actions (count + each action with its cost).
- Generates **items** for everything actionable:
  - **Actions** become activatable feats. Attacks get an *Attack* activity with
    the parsed to-hit bonus, melee/ranged + weapon/spell classification, reach
    or range, and one or more typed damage parts.
  - Saving-throw effects get a *Save* activity with the parsed DC, ability, and
    on-save behaviour (half / none).
  - **Features** become passive trait feats (still get save/attack activities
    where detected).
  - **Loot** entries become loot items with quantity and parsed price.
- Worldsmith companion-care details (intelligence, diet, housing, bonding
  ritual, positive/negative care effects, etc.) are preserved in a *Worldsmith
  Companion Details* section of the actor biography, and the full original JSON
  is stored under the actor's module flags.

### Items

Converts Worldsmith item exports into the matching dnd5e item type:

- **Weapons** → weapon items: base damage dice/type, versatile damage (stepped
  up a die size), simple/martial + melee/ranged classification, base item,
  reach/range, mapped weapon properties (versatile, finesse, magical, etc.),
  and a magical bonus parsed from the usage text.
- **Armor** → equipment items with armor class and armor type.
- **Potions / scrolls / poisons / ammunition / wands / rods** → consumables.
- **Rings / wondrous items / trinkets** → equipment; **gear / treasure** → loot.
- Shared physical fields for all items: rarity, price (with denomination),
  weight, quantity, attunement (with the requirement noted in the description),
  and limited-use charges with recharge period (e.g. "3 charges that recharge
  at dawn").
- Flavor text, mechanical usage text, and lore are combined into the item
  description, and the original JSON is stored under the item's module flags.

### Spells

Worldsmith spell exports become dnd5e **spell** items. When a spell name matches
an entry in the dnd5e SRD compendiums (`Spells (SRD)` / `Spells`), the module
imports that compendium document instead of generating a custom item. Custom or
homebrew spells still convert normally when no SRD match is found.

- Level and school (mapped to the dnd5e school key).
- Components → properties: verbal → `vocal`, somatic, material, ritual,
  concentration. Material text (and any "X gp" cost) is captured.
- Casting time → activation (action / bonus / reaction / timed), duration, and
  range (parsed from the description, e.g. "within 30 feet").
- A best-effort activity is generated from the description: a spell **attack**,
  a **save** (using the caster's spellcasting DC), a **damage** activity, or a
  plain utility activity, including any typed damage dice.
- The available classes/species and lore are appended to the description; the
  original JSON is stored under the item's module flags.

### Feats

Worldsmith feat exports become dnd5e **feat** items. When a feat name matches an
entry in the dnd5e SRD compendiums (primarily `Feats`, plus legacy feat packs),
the module imports that compendium document instead of generating a custom item.
Custom feats still convert normally when no SRD match is found.

- The mechanics, flavor (lore), category (subtitle), and prerequisites are
  combined into the description.
- Prerequisites are also stored structurally: a numeric **level** requirement is
  extracted into `system.prerequisites.level`, and the full prerequisite text is
  put in `system.requirements`.
- Limited-use phrasing ("once per day", "once per short/long rest", etc.) sets
  the feat's uses and adds a utility activity that expends a use; combat-style
  mechanics (attack/save/damage) generate the matching activity. Purely passive
  feats get no activity.
- The original JSON is stored under the item's module flags.

### Shops (Item Piles)

Worldsmith shop exports become a single **Item Piles merchant** actor whose
inventory is the shop's wares:

- The actor is flagged as an Item Piles merchant (on both the actor and its
  prototype token), so it opens directly as a merchant.
- **Standard items** are converted to the best-fitting dnd5e type — weapons and
  armor/shields are recognised by name and description (AC, damage dice,
  properties), and anything else becomes loot. Each carries its price.
- **Magic items** are converted with the full item importer (see above).
- **Services** become Item Piles *service* items (flagged `isService`), with the
  price parsed where possible and the original price text kept in the
  description (useful for "Varies" / percentage prices).
- **Owners** are imported as separate, fully-statted NPC actors (including their
  roleplay details and any attached quest).
- The shop description and lore are stored on the merchant's biography, and the
  original JSON under the merchant's module flags.

> **Requires [Item Piles](https://foundryvtt.com/packages/item-piles)** (and, on
> dnd5e v5, the companion **Item Piles: D&D 5e** module that provides the system
> integration). The merchant is created with the standard Item Piles flags, so
> Item Piles fills in the remaining merchant defaults automatically. Prices use
> each item's dnd5e `system.price`.

### Treasure / loot (Item Piles)

Worldsmith treasure exports become an **Item Piles loot pile** actor that the
party can loot:

- The actor is flagged as an Item Piles pile (on both the actor and its
  prototype token).
- The hoard's coins are written to the actor's currency (cp/sp/gp/pp).
- **Basic items** are converted to the best-fitting dnd5e type (weapons, armor,
  or loot — gems, art objects, potions, and scrolls become loot), with their
  quantity and price.
- **Notable items** are converted with the full item importer.
- The treasure description and lore are stored on the actor's biography, and the
  original JSON under the actor's module flags.

> Also **requires Item Piles** (loot piles work without the dnd5e companion, but
> it is recommended for full price/currency support).

### Quests

Worldsmith quest exports become a **journal entry** with one text page per
section that is present:

- **Overview** (subtitle + GM overview)
- **Adventure Hook**
- **Objectives** (an ordered list, with each objective's quote as a blockquote)
- **Rewards** (item, quantity, price, and details; non-prices like "n/a" are
  omitted)
- **Resolution**

The original JSON is stored under the journal entry's module flags. (Quests that
are embedded inside a creature or shop owner are also folded into that actor's
biography; this handles the standalone quest exports.)

### Encounters

Worldsmith encounter exports become a dnd5e **encounter** group actor (the actor
type used for combat groups in dnd5e v3+):

- Narrative sections (**Set the Scene**, **Objective**, **Key Features**) are
  written to the encounter actor's description.
- Each embedded monster stat block is imported as a separate **NPC actor** and
  linked as a group member with a quantity (parsed from names like `Goblin (x4)`
  when present, otherwise `1`).
- The encounter token is actor-linked so the group sheet opens when clicked.
- Embedded loot, spells, and feats are also imported as separate items when
  present.

Member NPCs match the same dnd5e structure as standalone creature imports (see
`examples/foundry-encounter-member-npc.json` for a Foundry export of one such
member).

### Groups

Worldsmith group exports (factions, organizations, parties) become a dnd5e
**group** actor:

- Organization sections (**Overview**, **Basic Information**, **Goals**,
  **Resources**, **Membership Requirements**, **Organization Structure**) are
  written to the group actor's description
- Embedded NPC stat blocks are imported as separate actors and linked as group
  members (no quantities — unlike encounter groups)
- The group token is actor-linked for quick access to the group sheet

### Dungeons

Worldsmith dungeon exports become a **journal entry** plus one **encounter group
actor** per room encounter:

- **Overview**, **Lore**, **Layout**, and **Objectives** pages at the dungeon level
- One journal page per **room**, combining that room's encounters, traps, and puzzles
- Each embedded encounter section becomes its own encounter group actor (with member
  NPCs and loot), using the same rules as standalone encounter imports

### Puzzles

Worldsmith puzzle exports become a **journal entry**:

- **Overview** (subtitle and DM description)
- **Intro Text** (player-facing setup)
- **Hints**, **Solution**, and **Failure Consequence** pages when present
- Embedded actors, items, spells, and feats are imported alongside the journal

### Traps

Worldsmith trap exports become a **journal entry**:

- **Overview** (trap type/subtitle and DM details)
- **Description** (player-facing scene text)
- **Skill Checks** and **Consequence** pages when present
- Embedded actors, items, spells, and feats are imported alongside the journal

### Roll Tables

Worldsmith roll table exports become a Foundry **RollTable**:

- Table **description** includes the subtitle and usage notes
- Each table row becomes a **text result** with a dice **range** (for example `1-5`, `96-100`)
- Roll formula is parsed from the subtitle when present (for example `(d100)` → `1d100`)
- Results use replacement drawing and display the roll in chat

## Installation

### Manifest URL

In Foundry, go to **Add-on Modules → Install Module** and paste the manifest URL
for a released `module.json`.

### Manual

1. Download or clone this repository.
2. Place it in your Foundry `Data/modules/` directory in a folder named
   **`worldsmith-foundry-import`** (the folder name must match the manifest `id`).
3. Restart Foundry and enable the module in your world.

## Usage

1. As a GM, open the **Actors** sidebar.
2. Click **Import Worldsmith**.
3. Select one or more Worldsmith `.json` files and/or paste JSON into the text
   area (creatures, items, and shops may be mixed).
4. Optionally choose a destination folder (Actor folders apply to creatures,
   Item folders to items) and whether to open the sheet(s).
5. Click **Import**.

### Scripting / Macro API

The module exposes an API on `game.modules.get("worldsmith-foundry-import").api`
and on the `WorldsmithImport` global:

```js
// Open the dialog
WorldsmithImport.open();

// Import directly from a JSON string (single object or array, creatures and/or items)
// Returns { actors: Actor[], items: Item[] }
await WorldsmithImport.importFromText(jsonString, { folderId, renderSheet: true });

// Detect the export type ("creature" | "item")
WorldsmithImport.detectWorldsmithType(parsedJson);

// Convert without creating
const { actorData } = WorldsmithImport.convertWorldsmith(parsedCreature);
const { itemData } = WorldsmithImport.convertWorldsmithItem(parsedItem);
const { merchant, owners } = WorldsmithImport.convertWorldsmithShop(parsedShop);
const { pile } = WorldsmithImport.convertWorldsmithTreasure(parsedTreasure);
const { journalData } = WorldsmithImport.convertWorldsmithQuest(parsedQuest);
const { itemData: spellData } = WorldsmithImport.convertWorldsmithSpell(parsedSpell);
const { itemData: featData } = WorldsmithImport.convertWorldsmithFeat(parsedFeat);
```

## Examples

Sample Worldsmith exports are included under [`examples/`](examples/):

- `stormwing-thunder-griffin.json` — a CR 8 companion mount (creature).
- `eldritch-behemoth.json` — a CR 25 legendary aberration with loot (creature).
- `whisker-guardian-monk.json` — a CR 16 Tabaxi monk NPC with a quest (creature).
- `blade-of-eternal-shadows.json` — a legendary magic longsword (item).
- `ethereal-chains-spell.json` — a 3rd-level concentration spell (spell).
- `echo-of-the-ancients-feat.json` — a feat with prerequisites and a daily
  ability (feat).
- `durins-forge-shop.json` — a blacksmith shop with wares, magic items,
  services, and an owner (shop → Item Piles merchant).
- `crypt-of-the-shadow-drake-treasure.json` — a dragon hoard with coins, gems,
  and magic items (treasure → Item Piles loot pile).
- `heist-of-the-sunfire-amulet-quest.json` — a heist quest with objectives,
  hook, and rewards (quest → journal entry).

## Development

The conversion logic in `scripts/converter.mjs`, `scripts/item-converter.mjs`,
`scripts/shop-converter.mjs` (shops and treasure), `scripts/journal-converter.mjs`
(quests), `scripts/spell-converter.mjs` (spells), `scripts/feat-converter.mjs` (feats),
`scripts/parsers.mjs`, `scripts/detect.mjs`, and `scripts/utils.mjs` is
intentionally free of Foundry runtime dependencies so it can be unit-tested in
plain Node:

```bash
node test/convert.test.mjs
# or
npm test
```

## Notes & Limitations

- Passive Perception is derived by dnd5e from the Perception skill, so the
  exported `passivePerception` value is not written directly.
- Text parsing is heuristic. Anything that can't be confidently parsed into an
  attack/save/damage activity is left untouched in the item description, so no
  information is lost.
- XP is recalculated by dnd5e from the challenge rating.

## License

[MIT](LICENSE)
