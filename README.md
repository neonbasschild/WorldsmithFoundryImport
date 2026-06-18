# Worldsmith Foundry Import

A [Foundry VTT](https://foundryvtt.com/) module that converts and imports
[Worldsmith](https://www.worldsmith.io/) JSON exports into the **dnd5e** system:

- **Creatures / companions** → fully-statted NPC actors.
- **Items** (weapons, armor, potions, wondrous items, etc.) → dnd5e items.

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
   area (creatures and items may be mixed).
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
```

## Examples

Sample Worldsmith exports are included under [`examples/`](examples/):

- `stormwing-thunder-griffin.json` — a CR 8 companion mount (creature).
- `eldritch-behemoth.json` — a CR 25 legendary aberration with loot (creature).
- `blade-of-eternal-shadows.json` — a legendary magic longsword (item).

## Development

The conversion logic in `scripts/converter.mjs`, `scripts/item-converter.mjs`,
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
